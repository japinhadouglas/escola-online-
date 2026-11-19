import puppeteerBase from 'puppeteer';
import { PuppeteerExtra } from 'puppeteer-extra/dist/index.js';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { prisma } from '../db.js';

const puppeteer = new PuppeteerExtra(puppeteerBase as any);
puppeteer.use(StealthPlugin());

/**
 * Serviço de Tarefas da CMSP (Sala do Futuro).
 *
 * A lista de tarefas do aluno vive no TMS da CMSP, servido por hosts *.ip.tv
 * atrás de Cloudflare. Não há proxy no BFF da SED; a API recusa bots (HTTP 403
 * challenge). Fluxo real, descoberto nos bundles oficiais do app:
 *
 *   1. troca o JWT da SED (sedToken) por um `auth_token` de sessão da CMSP via
 *      POST https://edusp-api.ip.tv/registration/edusp/token
 *   2. usa esse token como x-api-key do TMS
 *   3. consulta GET https://edusp-api.ip.tv/tms/adaptive-assessment/todo
 *      com publication_target = nome da turma (DescricaoTurma) da SED SP
 *
 * O desafio do Cloudflare exige um navegador real, então todo o fluxo roda num
 * único Puppeteer (exchange + todo na mesma página, reaproveitando o passe).
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOST = 'edusp-api.ip.tv';
const REGISTRATION_PATH = '/registration/edusp/token';
const TODO_PATH = '/tms/adaptive-assessment/todo';
// Consulta da Frequência do bimestre (tela de Faltas/Presença da CMSP).
// Campos confirmados nos bundles oficiais:
//   porcentagemPresenca, porcentagemFaltasBimestre, numeroFaltasBimestre,
//   totalAulasBimestre, bimestre / bimestreAtual.
const FREQUENCIA_PATH = '/apiboletim/api/Frequencia/ConsultaFrequenciaBimestre';

/** Dados do item reconhecidos nos bundles oficiais (Task Manager / TMS). */
export interface StudentTaskRaw {
  id?: string | number;
  task_id?: string | number;
  title?: string;
  status?: string;
  subject?: string;
  component?: string;
  author?: string;
  style?: string;
  publish_at?: string | null;
  created_at?: string | null;
  executed_on?: string | null;
  answers_count?: number;
  result_score?: number;
  card_label?: string;
  task?: Record<string, unknown>;
  answers?: unknown;
  [key: string]: unknown;
}

// ----------------------------------------------------------------- Puppeteer

function chromeArgs(): string[] {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-gpu',
  ];
  // Proxy residencial (opcional): contorna o bloqueio do Cloudflare a IPs de datacenter.
  // Configure a variável PROXY_URL no formato http://usuario:senha@host:porta
  if (process.env.PROXY_URL) {
    args.push(`--proxy-server=${process.env.PROXY_URL}`);
    console.log('[Puppeteer] Usando proxy residencial configurado em PROXY_URL');
  }
  return args;
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: chromeArgs(),
    protocolTimeout: 120_000,
  });
}

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Host': HOST,
    ...extra,
  };
}

/** fetch dentro do navegador (`page.evaluate`). Retorna status + JSON + corpo. */
async function pageFetch(
  page: Page,
  url: string,
  opts: Record<string, unknown>,
): Promise<{ status: number; json: any; text: string }> {
  return page.evaluate(
    async (u, o) => {
      const r = await fetch(u, o as RequestInit);
      const t = await r.text();
      let j: unknown = null;
      try {
        j = JSON.parse(t);
      } catch {
        /* corpo não-JSON */
      }
      return { status: r.status, json: j, text: t.slice(0, 800) };
    },
    url,
    opts,
  );
}

/** Executa uma promise com timeout duro. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de ${ms / 1000}s em ${label}`)), ms)
    ),
  ]);
}

/**
 * Abre uma página no host *.ip.tv para transpor o Cloudflare e entrega uma
 * função `api()` que executa fetchs dentro dela.
 */
async function abrirSessaoIpTv(): Promise<{
  api: (url: string, opts: Record<string, unknown>) => ReturnType<typeof pageFetch>;
  fechar: () => Promise<void>;
}> {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 768 });

    await withTimeout(
      page.goto(`https://${HOST}/mas/server/ts`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      }),
      35_000,
      'abrir sessão CMSP'
    );

    // Aguarda o Cloudflare resolver o challenge inicial (pode levar 5-15s)
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const ehCloudflare = await page.evaluate(() => {
        const t = (document.title || '').toLowerCase();
        const body = (document.body?.innerText || '').toLowerCase();
        return t.includes('cloudflare') ||
               t.includes('attention required') ||
               body.includes('checking if the site connection is secure') ||
               body.includes('verify you are human') ||
               body.includes('attention required');
      }).catch(() => false);

      if (!ehCloudflare) break;

      console.log(`[Puppeteer] Cloudflare challenge detectado (tentativa ${tentativa + 1}/5), aguardando...`);
      await new Promise((r) => setTimeout(r, 4000));
      if (tentativa < 4) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => {});
      }
    }
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }

  return {
    api: (url, opts) => withTimeout(pageFetch(page, url, opts), 20_000, `api ${url.split('?')[0]}`),
    fechar: () => browser.close().catch(() => {}),
  };
}

// --------------------------------------------------------------------- Todo

/** Bimestre letivo corrente (fev/mar=1, abr-jun=2, ago/set=3, out-dez=4). */
function bimestreAtual(): number {
  const mes = new Date().getMonth() + 1;
  if (mes === 2 || mes === 3) return 1;
  if (mes >= 4 && mes <= 6) return 2;
  if (mes >= 8 && mes <= 9) return 3;
  if (mes >= 10 && mes <= 12) return 4;
  return 1;
}

function buildTodoUrl(publicationTargets: string[], answerStatuses: string[]): string {
  const parts = [
    `https://${HOST}${TODO_PATH}`,
    '?filter_expired=false',
    '&expired_only=false',
    '&limit=100',
    '&offset=0',
  ];
  for (const t of publicationTargets) parts.push(`&publication_target=${encodeURIComponent(t)}`);
  for (const s of answerStatuses) parts.push(`&answer_statuses=${encodeURIComponent(s)}`);
  parts.push('&with_apply_moment=true');
  return parts.join('');
}

// ------------------------------------------------- Flujo completo em 1 sessão

export interface CmspSession {
  authToken: string;
  nick: string;
}

export interface TarefasCmspResultado {
  sessao: CmspSession;
  tarefas: StudentTaskRaw[];
  frequencia: FrequenciaCmspResumo | null;
}

/** Resumo de frequência do aluno no bimestre atual (CMSP /apiboletim). */
export interface FrequenciaCmspResumo {
  bimestre: number;
  bimestreAtual: boolean;
  /** % de presença no bimestre (0-100), campo oficial `porcentagemPresenca`. */
  porcentagemPresenca: number;
  /** % de faltas no bimestre (0-100), campo oficial `porcentagemFaltasBimestre`. */
  porcentagemFaltas: number;
  numeroFaltasBimestre: number;
  totalAulasBimestre: number;
}

function pickNumber(obj: any, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() && !isNaN(Number(v.replace(',', '.')))) {
      return Number(v.replace(',', '.'));
    }
  }
  return undefined;
}

/** Mapeia o corpo cru de ConsultaFrequenciaBimestre para o resumo tipado. */
function normalizeFrequency(body: any): FrequenciaCmspResumo | null {
  if (!body || typeof body !== 'object') return null;
  const bimestre = pickNumber(body, ['bimestre', 'ordinalBimestre']);
  if (bimestre == null) return null;
  return {
    bimestre,
    bimestreAtual: body?.bimestreAtual === true || body?.bimestreAtual === 'true',
    porcentagemPresenca: pickNumber(body, ['porcentagemPresenca', 'percentualPresenca']) ?? 0,
    porcentagemFaltas:
      pickNumber(body, ['porcentagemFaltasBimestre', 'porcentagemFaltas']) ??
      pickNumber(body, ['percentualFaltas']) ??
      100 - (pickNumber(body, ['porcentagemPresenca']) ?? 100),
    numeroFaltasBimestre: pickNumber(body, ['numeroFaltasBimestre', 'totalFaltasBimestre']) ?? 0,
    totalAulasBimestre: pickNumber(body, ['totalAulasBimestre', 'totalAulasRealizadas']) ?? 0,
  };
}

/**
 * Consulta a frequência do aluno no bimestre (telas "Presença"/"Faltas" do app
 * CMSP). Usa a MESMA sessão Cloudflare do fluxo de tarefas e o mesmo auth_token
 * como x-api-key. Tolerante a falha: se a CMSP recusar, retorna `null` para não
 * derrubar a sincronização de tarefas (que continua sendo o objetivo principal).
 */
async function buscarFrequenciaNaSessao(
  sessaoBs: { api: (url: string, opts: Record<string, unknown>) => ReturnType<typeof pageFetch> },
  authToken: string,
  bimestre: number,
): Promise<FrequenciaCmspResumo | null> {
  try {
    const url = `https://${HOST}${FREQUENCIA_PATH}?bimestre=${bimestre}`;
    const r = await sessaoBs.api(url, {
      method: 'GET',
      headers: baseHeaders({
        'x-api-key': authToken,
        'x-api-realm': 'edusp',
        'x-api-platform': 'webclient',
      }),
    });

    const body = Array.isArray(r.json)
      ? r.json.find((x: any) => Number(x?.bimestre) === bimestre) ?? r.json[0]
      : r.json;
    if (!body || typeof body !== 'object') return null;

    return normalizeFrequency(body);
  } catch {
    return null;
  }
}

/**
 * Fluxo completo dentro de UMA sessão de navegador (transpõe o Cloudflare uma
 * única vez): exchange do sedToken -> auth_token e consulta do todo.
 */
async function buscarTarefasNaSessao(input: {
  sedToken: string;
  publicationTargets: string[];
  answerStatuses: string[];
}): Promise<TarefasCmspResultado> {
  const { sedToken, publicationTargets, answerStatuses } = input;

  const sessaoBs = await abrirSessaoIpTv();
  try {
    const reg = await sessaoBs.api(`https://${HOST}${REGISTRATION_PATH}`, {
      method: 'POST',
      headers: baseHeaders({ 'x-api-realm': 'edusp', 'x-api-platform': 'webclient' }),
      body: JSON.stringify({ token: sedToken }),
    });
    const regBody = reg.json as any;
    const authToken: string | undefined = regBody?.auth_token;
    const nick: string | undefined = regBody?.nick;
    if (reg.status !== 200 || !authToken) {
      throw new Error(
        `Não foi possível iniciar a sessão na CMSP (HTTP ${reg.status}): ` +
        `${regBody?.message || reg.text || 'token inválido ou expirado'}. ` +
        'Tente sair e entrar novamente para renovar o acesso à Sala do Futuro.'
      );
    }

    const url = buildTodoUrl(publicationTargets, answerStatuses);
    const todo = await sessaoBs.api(url, {
      method: 'GET',
      headers: baseHeaders({
        'x-api-key': authToken,
        'x-api-realm': 'edusp',
        'x-api-platform': 'webclient',
      }),
    });

    if (todo.status !== 200) {
      throw new Error(
        `Falha ao listar tarefas na CMSP (HTTP ${todo.status}): ` +
        `${todo.text || 'erro desconhecido'}`
      );
    }
    if (!Array.isArray(todo.json)) {
      throw new Error('Resposta inesperada da CMSP ao listar tarefas.');
    }

    // Mesmo bimestre que a CMSP usa no ano letivo corrente (1..4). Usamos o mês
    // do Relógio do servidor; se a API recusar, a consulta é tolerante (null).
    const bimestre = bimestreAtual();
    const frequencia = await buscarFrequenciaNaSessao(sessaoBs, authToken, bimestre);

    return {
      sessao: { authToken, nick: nick || '' },
      tarefas: todo.json as StudentTaskRaw[],
      frequencia,
    };
  } finally {
    await sessaoBs.fechar();
  }
}

// ------------------------------------------------------------ Normalização

function toDateOrNull(v: unknown): Date | null {
  if (v == null) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function pickString(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Extrai dados persistíveis de um item bruto do todo (chaves dos bundles). */
export function normalizeTask(
  item: StudentTaskRaw,
  turma: string,
): Omit<any, 'id' | 'userId' | 'syncCount' | 'createdAt' | 'updatedAt'> {
  const task: any = (item && typeof item === 'object' ? item.task : null) || item || {};
  const answers = (item && item.answers) ?? (task && task.answers);

  return {
    taskId: String(item?.task_id ?? item?.id ?? ''),
    subject:
      pickString(task, ['subject', 'component', 'component_name']) ||
      pickString(item, ['subject', 'component', 'component_name']) ||
      null,
    title: pickString(task, ['title', 'name']) || pickString(item, ['title', 'name']) || 'Atividade',
    description:
      pickString(task, ['description', 'desc']) || pickString(item, ['description']) || null,
    author: pickString(task, ['author']) || pickString(item, ['author']) || null,
    status: pickString(item, ['status']) || 'in_progress',
    style: pickString(task, ['style', 'kind', 'type']) || pickString(item, ['style']) || null,
    publishAt: toDateOrNull(task.publish_at ?? task.publishAt ?? task.created_at ?? item.publish_at),
    dueAt: toDateOrNull(task.due_at ?? task.dueAt ?? task.closed_at ?? item.due_at ?? item.dueAt),
    answers:
      answers != null
        ? (() => {
            try {
              return JSON.stringify(answers);
            } catch {
              return String(answers);
            }
          })()
        : null,
    raw: JSON.stringify(item ?? {}),
    turma,
  };
}

// -------------------------------------------------------------- Persistência

/** Grava a lista de tarefas do aluno e remove pendentes que sumiram da CMSP. */
export async function persistirTarefas(userId: string, tarefas: StudentTaskRaw[], turma: string) {
  const tarefaIds = new Set<string>();
  const upserts: any[] = [];

  for (const item of tarefas) {
    const rawId = item?.id ?? item?.task_id;
    if (rawId == null) continue;
    const taskId = String(rawId);
    tarefaIds.add(taskId);
    const norm = normalizeTask(item, turma);
    upserts.push({
      userId_taskId: { userId, taskId },
      update: { ...norm, syncCount: { increment: 1 } },
      create: { userId, ...norm },
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const u of upserts) {
      await tx.studentTask.upsert(u);
    }
    if (tarefaIds.size > 0) {
      await tx.studentTask.deleteMany({
        where: { userId, status: 'in_progress', taskId: { notIn: [...tarefaIds] } },
      });
    }
  });

  return prisma.studentTask.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
  });
}

/** Turmas (DescricaoTurma) do aluno usadas como publication_target. */
export async function publicacaoTargetDoUsuario(userId: string): Promise<string[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    include: { class: { select: { grade: true, name: true, code: true } } },
  });
  const targets = new Set<string>();
  for (const e of enrollments) {
    // Adiciona grade (ex: "1ª Série - Ensino Médio")
    if (e.class.grade && e.class.grade.trim()) targets.add(e.class.grade.trim());
    // Adiciona nome da turma (ex: "1ª Série A")
    if (e.class.name && e.class.name.trim()) targets.add(e.class.name.trim());
    // Adiciona código da turma
    if (e.class.code && e.class.code.trim()) targets.add(e.class.code.trim());
  }
  // Fallbacks comuns do CMSP
  targets.add('1ª SERIE');
  targets.add('1ª SÉRIE');
  targets.add('PRIMEIRA SERIE');
  targets.add('PRIMEIRA SÉRIE');
  targets.add('1 ANO');
  targets.add('1º ANO');
  targets.add('PRIMEIRO ANO');
  return [...targets];
}

// ------------------------------------------------------------ Sincronização

export interface TarefasSincronizadas {
  sincronizadoEm: string;
  sessaoValida: boolean;
  nick?: string;
  tarefas: any[];
  counts: { pendentes: number; finalizadas: number; expiradas: number };
  frequencia?: FrequenciaCmspResumo | null;
}

/** Fluxo completo da rota de Tarefas: troca token, busca e grava no banco. */
export async function sincronizarTarefasDoAluno(userId: string): Promise<TarefasSincronizadas> {
  // Timeout total de 60s — se a CMSP/Cloudflare travar, retorna erro e o
  // fallback da rota mostra as tarefas salvas no banco (modo offline).
  return withTimeout(sincronizarTarefasDoAlunoInner(userId), 60_000, 'sincronizar tarefas');
}

async function sincronizarTarefasDoAlunoInner(userId: string): Promise<TarefasSincronizadas> {
  const usuario = await prisma.user.findUnique({ where: { id: userId } });
  if (!usuario) throw new Error('Usuário não encontrado.');
  if (!usuario.sedToken) {
    throw new Error(
      'Sua conta ainda não tem acesso às tarefas da SED SP. ' +
      'Entre com seu RA e senha da Sala do Futuro para sincronizar.'
    );
  }

  const publicationTargets = await publicacaoTargetDoUsuario(userId);

  // A API recusa publication_target vazio; usa a turma real ou um fallback.
  const targets = publicationTargets.length > 0 ? publicationTargets : ['1ª SERIE'];

  // Busca TODAS as tarefas (pendentes, finalizadas e expiradas)
  const { sessao, tarefas, frequencia } = await buscarTarefasNaSessao({
    sedToken: usuario.sedToken,
    publicationTargets: targets,
    answerStatuses: ['in_progress', 'finished', 'expired'],
  });

  const turma = targets[0];
  const persistidas = await persistirTarefas(userId, tarefas, turma);

  const counts = { pendentes: 0, finalizadas: 0, expiradas: 0 };
  for (const t of persistidas) {
    if (t.status === 'finished') counts.finalizadas++;
    else if (t.publishAt && t.dueAt && t.dueAt < new Date()) counts.expiradas++;
    else counts.pendentes++;
  }

  return {
    sincronizadoEm: new Date().toISOString(),
    sessaoValida: true,
    nick: sessao.nick,
    tarefas: persistidas,
    counts: { pendentes: counts.pendentes, finalizadas: counts.finalizadas, expiradas: counts.expiradas },
    frequencia,
  };
}