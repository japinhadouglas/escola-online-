import { prisma } from '../db.js';
import bcrypt from 'bcryptjs';
import { syncSubjectChannelsForClass, subjectToChannelSlug } from './subjectChannels.js';

/**
 * Garante que os professores da escola estejam matriculados como membros
 * (role TEACHER) na turma, para que os alunos vejam os professores presentes
 * na sala — inclusive em turmas criadas automaticamente pelo bot SED SP.
 */
export async function ensureTeachersPresentInClass(classId: string, schoolId: string) {
  const existingTeachers = await prisma.enrollment.findMany({
    where: { classId, role: 'TEACHER' },
    select: { userId: true },
  });
  const existingIds = new Set(existingTeachers.map((e) => e.userId));

  const schoolTeachers = await prisma.user.findMany({
    where: { schoolId, role: 'TEACHER', isActive: true },
    select: { id: true },
  });

  for (const teacher of schoolTeachers) {
    if (existingIds.has(teacher.id)) continue;
    await prisma.enrollment.create({
      data: { userId: teacher.id, classId, role: 'TEACHER', subject: 'Geral' },
    }).catch(() => {
      // Ignorar duplicidade (concorrência)
    });
  }
}

export interface SalaDoFuturoStudent {
  ra: string;
  name: string;
  grade: string;
  schoolName: string;
  schoolCode: string;
  role: 'STUDENT' | 'TEACHER' | 'COORDINATOR' | 'ADMIN';
  avatarUrl: string;
  email: string;
  token: string;
  codigoUsuario: string;
  escolaCodigo: string;
  cookie?: string;
  isMonitor?: boolean; // Aluno monitor da Sala do Futuro
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const BFF_BASE = 'https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi';
const BFF_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/plain, */*',
  'ocp-apim-subscription-key': 'd701a2043aa24d7ebb37e9adf60d043b',
  'x-product-name': 'SalaDoFuturo',
  'Origin': 'https://saladofuturo.educacao.sp.gov.br',
  'Referer': 'https://saladofuturo.educacao.sp.gov.br/',
  'User-Agent': UA,
};

function normalizeRA(input: string): string {
  let cleaned = input.trim().replace(/\s+/g, '').toUpperCase();
  if (cleaned.endsWith('SP')) cleaned = cleaned.slice(0, -2);
  const digits = cleaned.replace(/[^0-9]/g, '');
  return digits + 'SP';
}

const MONITOR_FLAG_KEYS = new Set([
  'monitor',
  'ismonitor',
  'alunomonitor',
  'ealunomonitor',
  'ehmonitor',
  'isalunomonitor',
  'flgmonitor',
  'flgmonitora',
]);

const RESPONSE_WRAPPER_KEYS = new Set(['data', 'result', 'resultado', 'value', 'valor']);

function normalizeResponseKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function parseBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
}

/**
 * A SED pode responder a verificação de monitoria como `true`/`false` puro,
 * como `{ data: true }` ou dentro de uma chave explícita de monitoria.
 * Retorna undefined quando a resposta não contém essa decisão.
 */
function extractMonitorFlag(value: unknown, allowBareBoolean = true): boolean | undefined {
  const bareBoolean = parseBooleanFlag(value);
  if (bareBoolean !== undefined) return allowBareBoolean ? bareBoolean : undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractMonitorFlag(item, false);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }

  if (!value || typeof value !== 'object') return undefined;

  const entries = Object.entries(value as Record<string, unknown>);

  // Prioridade máxima para chaves que identificam explicitamente a função.
  for (const [key, child] of entries) {
    const normalizedKey = normalizeResponseKey(key);
    if (MONITOR_FLAG_KEYS.has(normalizedKey) || normalizedKey.includes('monitor')) {
      const direct = parseBooleanFlag(child);
      if (direct !== undefined) return direct;
      const nested = extractMonitorFlag(child, true);
      if (nested !== undefined) return nested;
    }
  }

  // Alguns endpoints encapsulam o booleano em data/result/value.
  for (const [key, child] of entries) {
    if (RESPONSE_WRAPPER_KEYS.has(normalizeResponseKey(key))) {
      const nested = extractMonitorFlag(child, true);
      if (nested !== undefined) return nested;
    }
  }

  return undefined;
}

/**
 * Busca o perfil do aluno na SED para detectar se é monitor automaticamente.
 * Tenta múltiplos endpoints e loga tudo para debug.
 */
async function buscarPerfilAlunoSalaDoFuturo(student: SalaDoFuturoStudent): Promise<boolean | undefined> {
  if (!student.token || !student.codigoUsuario) return undefined;

  const headers: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'Authorization': `Bearer ${student.token}`,
    'ocp-apim-subscription-key': BFF_HEADERS['ocp-apim-subscription-key'],
    'x-product-name': 'SalaDoFuturo',
    ...(student.cookie ? { 'Cookie': student.cookie } : {}),
  };

  const codigoForApi =
    student.codigoUsuario.length > 8 ? student.codigoUsuario.slice(0, -1) : student.codigoUsuario;

  // Endpoint oficial observado na Sala do Futuro (Network): a resposta informa
  // os componentes de monitoria em data.componentes. Testamos o caminho oficial
  // antes dos endpoints de perfil, que podem conter outros campos booleanos.
  const endpoints = [
    { name: 'AlunoMonitorValidoMuralAvisos', url: `${BFF_BASE}/muralavisosapi/api/aluno-monitor/aluno-monitor-valido?UsuarioId=${encodeURIComponent(codigoForApi)}` },
    { name: 'AlunoMonitorValido', url: `${BFF_BASE}/apihubintegracoes/api/v2/Aluno/aluno-monitor-valido?UsuarioId=${encodeURIComponent(student.codigoUsuario)}` },
    { name: 'AlunoMonitorValidoSemDigito', url: `${BFF_BASE}/apihubintegracoes/api/v2/Aluno/aluno-monitor-valido?UsuarioId=${encodeURIComponent(codigoForApi)}` },
    { name: 'AlunoMonitorValidoRaiz', url: `${BFF_BASE}/apihubintegracoes/api/v2/aluno-monitor-valido?UsuarioId=${encodeURIComponent(student.codigoUsuario)}` },
    // Endpoints de perfil continuam como fallback apenas quando não retornam
    // uma decisão explícita de monitoria.
    { name: 'ObterPerfilAluno', url: `${BFF_BASE}/apihubintegracoes/api/v2/Aluno/ObterPerfilAluno?codigoAluno=${codigoForApi}` },
    { name: 'Componentes', url: `${BFF_BASE}/apihubintegracoes/api/v2/Aluno/Componentes?codigoAluno=${codigoForApi}` },
    { name: 'Funcoes', url: `${BFF_BASE}/apihubintegracoes/api/v2/Aluno/Funcoes?codigoAluno=${codigoForApi}` },
    { name: 'PerfilCompleto', url: `${BFF_BASE}/apihubintegracoes/api/v2/Aluno/Perfil?codigoAluno=${codigoForApi}` },
    { name: 'DadosAluno', url: `${BFF_BASE}/apihubintegracoes/api/v2/Aluno/Dados?codigoAluno=${codigoForApi}` },
    { name: 'Boletim/Perfil', url: `${BFF_BASE}/apiboletim/api/Aluno/Perfil?codigoAluno=${codigoForApi}` },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetchTimeout(ep.url, { method: 'GET', headers }, 8000);
      console.log(`[SalaDoFuturo] [${ep.name}] HTTP ${res.status}`);
      
      if (!res.ok) {
        console.log(`[SalaDoFuturo] [${ep.name}] Falhou: ${res.status}`);
        continue;
      }

      const data = await res.json() as any;
      // Log COMPLETO da resposta para debug
      console.log(`[SalaDoFuturo] [${ep.name}] RESPONSE:`, JSON.stringify(data, null, 2));

      const explicitMonitorFlag = extractMonitorFlag(data);
      if (explicitMonitorFlag !== undefined) {
        console.log(`[SalaDoFuturo] [${ep.name}] Status de monitor recebido: ${explicitMonitorFlag}`);
        return explicitMonitorFlag;
      }

      // O endpoint oficial muralavisosapi retorna as disciplinas atribuídas
      // ao monitor em `data.componentes`, em vez de um booleano. Caroline,
      // por exemplo, recebeu duas componentes nessa resposta. Lista vazia
      // significa que não há monitoria para o usuário.
      if (ep.name === 'AlunoMonitorValidoMuralAvisos') {
        const componentes = data?.data?.componentes;
        if (Array.isArray(componentes)) {
          const monitorValido = componentes.length > 0;
          console.log(`[SalaDoFuturo] [${ep.name}] Componentes de monitoria: ${componentes.length}; status: ${monitorValido}`);
          return monitorValido;
        }
      }

    } catch (err: any) {
      console.log(`[SalaDoFuturo] [${ep.name}] ERRO: ${err.message}`);
    }
  }

  // Também verificar no JWT payload se tem claim explícito de monitor
  const jwtPayload = decodeJwtPayload(student.token);
  if (jwtPayload) {
    console.log(`[SalaDoFuturo] JWT PAYLOAD:`, JSON.stringify(jwtPayload, null, 2));
    const jwtMonitorFlag = extractMonitorFlag(jwtPayload, false);
    if (jwtMonitorFlag !== undefined) {
      console.log(`[SalaDoFuturo] Status de monitor recebido no JWT: ${jwtMonitorFlag}`);
      return jwtMonitorFlag;
    }
  }

  console.log(`[SalaDoFuturo] Nenhum endpoint retornou flag de monitor para ${student.ra}`);
  return undefined;
}

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function parseCookies(setCookies: string[]): string {
  return setCookies.map(c => c.split(';')[0]).join('; ');
}

async function fetchTimeout(url: string, opts: RequestInit, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export async function autenticarSalaDoFuturo(rawRA: string, senha: string): Promise<SalaDoFuturoStudent> {
  const ra = normalizeRA(rawRA);

  console.log(`[SalaDoFuturo] Autenticando RA: ${ra}`);

  const loginRes = await fetchTimeout(`${BFF_BASE}/credenciais/api/LoginCompletoToken`, {
    method: 'POST',
    headers: BFF_HEADERS,
    body: JSON.stringify({ user: ra, senha }),
  }, 12000);

  if (!loginRes.ok) {
    const text = await loginRes.text().catch(() => '');
    throw new Error(
      `Servidor SED retornou HTTP ${loginRes.status}. ` +
      `Verifique se seu RA e senha estão corretos. Detalhes: ${text.substring(0, 200)}`
    );
  }

  const loginData = await loginRes.json() as any;

  if (loginData.statusCode !== 200 || !loginData.token) {
    throw new Error(
      `Credenciais inválidas na Sala do Futuro. ` +
      `Resposta: ${loginData.statusRetorno || 'desconhecido'}`
    );
  }

  console.log(`[SalaDoFuturo] Login bem-sucedido! Token recebido.`);

  const jwtPayload = decodeJwtPayload(loginData.token);
  if (!jwtPayload) {
    throw new Error('Erro ao decodificar token de autenticação.');
  }

  const nome = jwtPayload.NAME || jwtPayload.NOME || jwtPayload.nome || '';
  const login = jwtPayload.LOGIN || jwtPayload.login || ra;
  const codigoUsuario = jwtPayload.CD_USUARIO || jwtPayload.cd_usuario || '';

  console.log(`[SalaDoFuturo] Aluno: ${nome} | Codigo: ${codigoUsuario}`);

  const cookieStr = parseCookies(loginRes.headers.getSetCookie());

  let escolaNome = 'Escola Estadual SED SP';
  let escolaCodigo = 'SED-SP';
  let turmaNome = 'Ensino Médio';
  let serieNome = '1ª Série';

  try {
    const turmaHeaders: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${loginData.token}`,
      'ocp-apim-subscription-key': BFF_HEADERS['ocp-apim-subscription-key'],
      'x-product-name': 'SalaDoFuturo',
      'Cookie': cookieStr,
    };

    const codigoForApi = codigoUsuario.length > 8 ? codigoUsuario.slice(0, -1) : codigoUsuario;

    const turmasRes = await fetchTimeout(
      `${BFF_BASE}/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoForApi}`,
      { method: 'GET', headers: turmaHeaders },
      8000
    );

    if (turmasRes.ok) {
      const turmasData = await turmasRes.json() as any;
      if (turmasData.data && turmasData.data.length > 0) {
        const turma = turmasData.data[0];
        escolaNome = turma.NomeEscola || escolaNome;
        escolaCodigo = String(turma.CodigoEscola || escolaCodigo);
        turmaNome = turma.DescricaoTurma || turmaNome;
        serieNome = turma.NomeTipoEnsino || serieNome;
        console.log(`[SalaDoFuturo] Escola: ${escolaNome} | Turma: ${turmaNome}`);
      } else {
        console.log(`[SalaDoFuturo] Nenhuma turma encontrada para codigo ${codigoForApi}`);
      }
    } else {
      console.log(`[SalaDoFuturo] Busca de turmas retornou HTTP ${turmasRes.status}`);
    }
  } catch (err: any) {
    console.log(`[SalaDoFuturo] Aviso: nao foi possivel buscar turmas: ${err.message}`);
  }

  const raDigits = ra.replace(/[^0-9]/g, '');
  const studentBase: SalaDoFuturoStudent = {
    ra,
    name: nome,
    grade: turmaNome || serieNome,
    schoolName: escolaNome,
    schoolCode: escolaCodigo,
    role: 'STUDENT',
    avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(nome)}&background=5865F2&color=fff&bold=true&size=128`,
    email: `${raDigits}@aluno.educacao.sp.gov.br`,
    token: loginData.token,
    codigoUsuario,
    escolaCodigo,
    cookie: cookieStr,
  };

  // Detectar monitor AUTOMATICAMENTE via a resposta booleana da SED
  let isMonitor = extractMonitorFlag(loginData, false);
  if (isMonitor === undefined) {
    isMonitor = await buscarPerfilAlunoSalaDoFuturo(studentBase);
  }
  
  // Sem uma resposta explícita true da SED, o usuário não é monitor.
  // Não reutilizar um valor antigo do banco: isso fazia aluno normal continuar
  // vendo a aba depois de uma sincronização incompleta ou de uma promoção antiga.
  isMonitor = isMonitor ?? false;
  
  console.log(`[SalaDoFuturo] Status final de monitor para ${nome}: ${isMonitor}`);

  return {
    ...studentBase,
    isMonitor,
  };
}

export async function sincronizarAluno(student: SalaDoFuturoStudent, senhaRaw: string) {
  const passwordHash = await bcrypt.hash(senhaRaw, 10);

  let escola = await prisma.school.findFirst({ where: { code: student.schoolCode } });
  if (!escola) {
    escola = await prisma.school.create({
      data: {
        name: student.schoolName,
        code: student.schoolCode,
        city: 'São Paulo',
        state: 'SP',
        type: 'ESTADUAL',
      },
    });
  }

  let usuario = await prisma.user.findFirst({
    where: { registrationNumber: student.ra, schoolId: escola.id },
  });

  if (!usuario) {
    usuario = await prisma.user.create({
      data: {
        schoolId: escola.id,
        registrationNumber: student.ra,
        name: student.name,
        email: student.email,
        passwordHash,
        role: student.role,
        avatarUrl: student.avatarUrl,
        sedToken: student.token,
        sedCookie: student.cookie || null, // sf_sid — destrava as APIs de conteúdo digital da SED
        isActive: true,
        isMonitor: student.isMonitor ?? false,
      },
    });
  } else {
    usuario = await prisma.user.update({
      where: { id: usuario.id },
      data: {
        name: student.name,
        email: student.email,
        avatarUrl: student.avatarUrl,
        passwordHash,
        sedToken: student.token,
        sedCookie: student.cookie || null, // sf_sid — destrava as APIs de conteúdo digital da SED
        lastLoginAt: new Date(),
        isMonitor: student.isMonitor ?? usuario.isMonitor, // Preserva status se já era monitor
      },
    });
  }

  const classCode = `CLASS-${student.grade.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20).toUpperCase()}-2026`;
  let turma = await prisma.class.findFirst({
    where: { schoolId: escola.id, grade: student.grade },
  });
  if (!turma) {
    turma = await prisma.class.create({
      data: {
        schoolId: escola.id,
        name: `Sala ${student.grade}`,
        grade: student.grade,
        shift: 'MANHA',
        year: 2026,
        code: classCode,
      },
    });
  }

  // Grade curricular completa de canais de matéria, conforme a etapa de ensino.
  // Aluno real (SED SP) vê todas as matérias da sua série. Roda em TODO login
  // (não só na criação da turma) para garantir que nenhuma matéria fique faltando.
  await ensureSubjectChannelsForStudent(student, turma.id);

  const matricula = await prisma.enrollment.findUnique({
    where: { userId_classId: { userId: usuario.id, classId: turma.id } },
  });
  if (!matricula) {
    await prisma.enrollment.create({
      data: { userId: usuario.id, classId: turma.id, role: student.role },
    });
  }

  // Sincronizar canais de matéria automaticamente a partir das matérias dos professores
  await syncSubjectChannelsForClass(turma.id, prisma);

  // Garantir que a turma tenha professores como membros, para que os alunos
  // vejam os professores (com suas matérias) presentes na sala.
  await ensureTeachersPresentInClass(turma.id, escola.id);

  // Sincronizar a grade horária real (agenda de aulas) da turma na SED SP.
  // Best-effort: se a SED não responder, mantém a agenda já gravada.
  await sincronizarAgendaDaTurma(student, turma.id);

  return { usuario, escola, turma };
}

export interface SalaDoFuturoProfessor {
  cpf: string;
  name: string;
  email: string;
  token: string;
  codigoUsuario: string;
  cookie?: string;
}

/**
 * Autentica um PROFESSOR na SED SP / Sala do Futuro usando CPF + senha.
 *
 * A Sala do Futuro Professor hoje entra via gov.br (OIDC), e o endpoint
 * LoginCompletoToken da BFF oficial atende alunos (RA). Aqui tentamos o mesmo
 * endpoint com o CPF do professor como "user" — se a SED passou a aceitar
 * CPF, o professor consegue entrar; se não, o login local continua valendo.
 */
export async function autenticarProfessorSalaDoFuturo(cpfRaw: string, senha: string): Promise<SalaDoFuturoProfessor> {
  const cpf = cpfRaw.replace(/[^0-9]/g, '');
  console.log(`[SalaDoFuturo] Autenticando professor: CPF ${cpf}`);

  const loginRes = await fetchTimeout(`${BFF_BASE}/credenciais/api/LoginCompletoToken`, {
    method: 'POST',
    headers: BFF_HEADERS,
    body: JSON.stringify({ user: cpf, senha }),
  }, 12000);

  if (!loginRes.ok) {
    const text = await loginRes.text().catch(() => '');
    throw new Error(
      `Servidor SED retornou HTTP ${loginRes.status} para o CPF informado. ` +
      `Detalhes: ${text.substring(0, 200)}`
    );
  }

  const loginData = await loginRes.json() as any;
  if (loginData.statusCode !== 200 || !loginData.token) {
    throw new Error(
      `CPF ou senha inválidos na Sala do Futuro. ` +
      `Resposta: ${loginData.statusRetorno || 'desconhecido'}`
    );
  }

  const jwtPayload = decodeJwtPayload(loginData.token);
  const nome = (jwtPayload && (jwtPayload.NAME || jwtPayload.NOME || jwtPayload.nome)) || cpf;
  const codigoUsuario = (jwtPayload && (jwtPayload.CD_USUARIO || jwtPayload.cd_usuario)) || '';
  console.log(`[SalaDoFuturo] Professor autenticado: ${nome}`);

  return {
    cpf,
    name: nome,
    email: `${cpf}@prof.educacao.sp.gov.br`,
    token: loginData.token,
    codigoUsuario,
    cookie: parseCookies(loginRes.headers.getSetCookie()),
  };
}

/**
 * Cria/atualiza a conta local do PROFESSOR autenticado na SED SP. A escola é
 * preservada se o professor já existir; caso seja novo, vincula à escola onde
 * ele trabalha quando a SED informar, ou à escola padrão da rede.
 */
export async function sincronizarProfessor(prof: SalaDoFuturoProfessor, senhaRaw: string) {
  const passwordHash = await bcrypt.hash(senhaRaw, 10);

  const cpfDigits = prof.cpf.replace(/[^0-9]/g, '');

  let usuario = await prisma.user.findFirst({
    where: {
      role: 'TEACHER',
      OR: [
        { cpf: cpfDigits },
        { registrationNumber: cpfDigits },
        { email: prof.email },
      ],
    },
  });

  let escola = usuario ? await prisma.school.findUnique({ where: { id: usuario.schoolId } }) : null;

  if (!escola) {
    escola = await prisma.school.findFirst({ where: { type: 'ESTADUAL' } });
    if (!escola) {
      escola = await prisma.school.findFirst();
    }
  }
  if (!escola) {
    escola = await prisma.school.create({
      data: {
        name: 'Secretaria da Educação do Estado de São Paulo',
        code: 'SED-SP',
        city: 'São Paulo',
        state: 'SP',
        type: 'ESTADUAL',
      },
    });
  }

  if (!usuario) {
    usuario = await prisma.user.create({
      data: {
        schoolId: escola.id,
        registrationNumber: cpfDigits,
        cpf: cpfDigits,
        name: prof.name,
        email: prof.email,
        passwordHash,
        role: 'TEACHER',
        isActive: true,
      },
    });
  } else {
    usuario = await prisma.user.update({
      where: { id: usuario.id },
      data: {
        name: prof.name,
        email: prof.email,
        cpf: cpfDigits,
        passwordHash,
        lastLoginAt: new Date(),
      },
    });
  }

  return { usuario, escola };
}

/**
 * Converte o nome vindo da SED SP para um nome de canal amigável que o usuário
 * reconhece (ex.: "LINGUA PORTUGUESA" -> "português", "EDUCAÇAO FINANCEIRA" ->
 * "educação financeira"). A lista de MATÉRIAS continua vindo 100% da SED (o RA),
 * este mapa só deixa os nomes bonitos/consistentes com os canais já existentes.
 */
function friendlyChannelName(disciplineName: string): string {
  const slug = subjectToChannelSlug(disciplineName);
  const map: Record<string, string> = {
    'lingua-portuguesa': 'português',
    'lingua-portugesa': 'português',
    'lingua-portugues': 'português',
    'portugues': 'português',
    'lingua-inglesa': 'inglês',
    'lingua-ingles': 'inglês',
    'ingles': 'inglês',
    'educacao-fisica': 'educação física',
    'educacao-fisico': 'educação física',
    'educacao-financeira': 'educação financeira',
    'educacao-financeiro': 'educação financeira',
    'redacao-e-leitura': 'redação e leitura',
    'redacao': 'redação',
    'arte': 'arte',
    'artes': 'artes',
    'fisica': 'física',
    'quimica': 'química',
    'matematica': 'matemática',
    'historia': 'história',
    'geografia': 'geografia',
    'biologia': 'biologia',
    'filosofia': 'filosofia',
    'sociologia': 'sociologia',
    'ciencias': 'ciências',
  };
  if (map[slug]) return map[slug];
  return slug;
}

/**
 * Busca as DISCIPLINAS (matérias) reais e configuradas do aluno na SED SP /
 * Sala do Futuro para o RA informado. Substitui qualquer lista fixa e garante
 * que os canais reflitam exatamente o que está configurado no RA.
 *
 * @returns {Promise<string[]>} lista de NOMES AMIGÁVEIS de disciplina
 *   (deduplicados pelo slug) — lista vazia se a API não retornar disciplinas.
 */
async function listarDisciplinasDoAluno(student: SalaDoFuturoStudent): Promise<string[]> {
  const disciplinas: string[] = [];
  if (!student.token || !student.codigoUsuario) return disciplinas;

  const headers: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'Authorization': `Bearer ${student.token}`,
    'ocp-apim-subscription-key': BFF_HEADERS['ocp-apim-subscription-key'],
    'x-product-name': 'SalaDoFuturo',
    ...(student.cookie ? { 'Cookie': student.cookie } : {}),
  };

  const codigoForApi =
    student.codigoUsuario.length > 8 ? student.codigoUsuario.slice(0, -1) : student.codigoUsuario;

  try {
    const res = await fetchTimeout(
      `${BFF_BASE}/apihubintegracoes/api/v2/Disciplina/ListarDisciplinaPorAluno?codigoAluno=${codigoForApi}`,
      { method: 'GET', headers },
      8000,
    );

    if (!res.ok) {
      console.log(`[SalaDoFuturo] ListarDisciplinaPorAluno retornou HTTP ${res.status}`);
      return disciplinas;
    }

    const data = await res.json() as any;
    const items: any[] = Array.isArray(data) ? data : data?.data ?? [];

    const nameKeys = [
      'NomeDisciplina',
      'DescricaoDisciplina',
      'DISCIPLINA',
      'Disciplina',
      'NomeComponenteCurricular',
      'ComponenteCurricular',
      'Materia',
      'MATERIA',
      'name',
      'nome',
    ];

    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      let name: string | undefined;
      for (const key of nameKeys) {
        const v = item[key];
        if (typeof v === 'string' && v.trim()) {
          name = v.trim();
          break;
        }
      }
      if (!name) continue;
      const friendly = friendlyChannelName(name);
      const slug = subjectToChannelSlug(friendly);
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        disciplinas.push(friendly);
      }
    }

    console.log(`[SalaDoFuturo] Disciplinas do RA: ${JSON.stringify(disciplinas)}`);
  } catch (err: any) {
    console.log(`[SalaDoFuturo] Aviso: nao foi possivel buscar disciplinas: ${err.message}`);
  }

  return disciplinas;
}

export interface AgendaAula {
  diaDaSemana: number;
  horaInicioAula: string;
  horaFimAula: string;
  nomeDisciplina: string;
  disciplinaId: number;
  turmaId: number;
}

/**
 * Busca a AGENDA (grade horária) de um dia letivo na Sala do Futuro para o
 * aluno autenticado. A resposta traz as aulas da turma daquele dia específico
 * (diaDaSemana, horário de início/fim, disciplina e turmaId).
 *
 * Endpoint real descoberto nos bundles oficiais: o boletim/agenda fica em
 * "apiboletim", e não em "apihubintegracoes". Usa o codigoAluno SEM o dígito
 * verificador e o ano letivo como parâmetros.
 */
async function listarAgendaDoAluno(student: SalaDoFuturoStudent, dataAgenda: string): Promise<AgendaAula[]> {
  const aulas: AgendaAula[] = [];
  if (!student.token || !student.codigoUsuario) return aulas;

  const headers: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'Authorization': `Bearer ${student.token}`,
    'ocp-apim-subscription-key': BFF_HEADERS['ocp-apim-subscription-key'],
    'x-product-name': 'SalaDoFuturo',
    'Origin': BFF_HEADERS['Origin'],
    'Referer': BFF_HEADERS['Referer'],
    ...(student.cookie ? { 'Cookie': student.cookie } : {}),
  };

  const codigoForApi =
    student.codigoUsuario.length > 8 ? student.codigoUsuario.slice(0, -1) : student.codigoUsuario;
  const anoLetivo = new Date(dataAgenda).getFullYear();

  try {
    const res = await fetchTimeout(
      `${BFF_BASE}/apiboletim/api/Agenda/GetAgendaDia?codigoAluno=${codigoForApi}&anoLetivo=${anoLetivo}&dataAgenda=${dataAgenda}`,
      { method: 'GET', headers },
      10000,
    );

    if (!res.ok) {
      console.log(`[SalaDoFuturo] GetAgendaDia retornou HTTP ${res.status}`);
      return aulas;
    }

    const data = await res.json() as any;
    const itens: any[] = data?.data?.agendaAluno ?? [];
    if (!Array.isArray(itens)) return aulas;

    const seen = new Set<string>();
    for (const item of itens) {
      if (!item || typeof item !== 'object') continue;
      const diaDaSemana = Number(item.diaDaSemana);
      const horaInicio = String(item.horaInicioAula ?? '').trim();
      if (!diaDaSemana || diaDaSemana < 1 || diaDaSemana > 7 || !horaInicio) continue;
      const nome = String(item.nomeDisciplina ?? '').trim() || 'Aula';
      const chave = `${diaDaSemana}|${horaInicio}|${nome}`;
      if (seen.has(chave)) continue;
      seen.add(chave);
      aulas.push({
        diaDaSemana,
        horaInicioAula: horaInicio.substring(0, 5),
        horaFimAula: String(item.horaFimAula ?? '').trim().substring(0, 5),
        nomeDisciplina: nome,
        disciplinaId: Number(item.disciplinaId ?? -1),
        turmaId: Number(item.turmaId ?? -1),
      });
    }

    console.log(`[SalaDoFuturo] Agenda ${dataAgenda}: ${aulas.length} aulas`);
  } catch (err: any) {
    // Repassar falhas de rede/timeout para o chamador tentar de novo (retry por
    // dia). Um dia sem aula (feriado/fim de semana) retorna 200 com lista vazia,
    // então não cai aqui — somente erro real de transporte.
    const isAbort = err?.name === 'AbortError' || /operation was aborted/i.test(String(err?.message));
    if (isAbort) {
      throw new Error(`Timeout ao buscar agenda do dia (${dataAgenda}).`);
    }
    console.log(`[SalaDoFuturo] Aviso: nao foi possivel buscar agenda do dia: ${err.message}`);
  }

  return aulas;
}

/**
 * Sincroniza a grade horária semanal da turma no banco local a partir da
 * agenda real da SED SP. Consulta os dias letivos (segunda a sexta) da semana
 * corrente e reescreve a tabela ClassSchedule, marcando o INTERVALO.
 *
 * Best-effort: nunca lança erro — se a SED não responder, mantém o que já
 * existia no banco. Chamada em todo login de aluno real.
 */
export async function sincronizarAgendaDaTurma(student: SalaDoFuturoStudent, classId: string): Promise<void> {
  try {
    const hoje = new Date();
    const diaSemanaJs = (hoje.getDay() + 6) % 7; // 0=Seg ... 6=Dom
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() - diaSemanaJs);

    const porDia = new Map<number, AgendaAula[]>();
    const diasFalharam: number[] = [];
    for (let i = 0; i < 5; i++) {
      const dia = new Date(segunda);
      dia.setDate(segunda.getDate() + i);
      const yy = dia.getFullYear();
      const mm = String(dia.getMonth() + 1).padStart(2, '0');
      const dd = String(dia.getDate()).padStart(2, '0');
      const dataStr = `${yy}-${mm}-${dd}`;

      // Retry por dia: a SED às vezes aborta/timeout num único dia e, sem isso,
      // a grade daquele dia deixa de ser gravada (ex.: terça-feira vazia).
      let aulas: AgendaAula[] = [];
      let ok = false;
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        try {
          aulas = await listarAgendaDoAluno(student, dataStr);
          ok = true;
          break;
        } catch (err: any) {
          console.log(`[SalaDoFuturo] Falha ao buscar agenda ${dataStr} (tentativa ${tentativa}/3): ${err.message}`);
          if (tentativa < 3) await new Promise((r) => setTimeout(r, 800 * tentativa));
        }
      }
      if (!ok) diasFalharam.push(i + 1);

      for (const aula of aulas) {
        // Manter apenas aulas vinculadas à turma real da SED (sem INTERVALO
        // genérico vazio de "-1").
        if (!aula.turmaId || aula.turmaId < 0) continue;
        const lista = porDia.get(aula.diaDaSemana) ?? [];
        lista.push(aula);
        porDia.set(aula.diaDaSemana, lista);
      }
    }

    // Se TODOS os 5 dias falharem, não mexer em nada (mantém a grade atual).
    if (diasFalharam.length >= 5) {
      console.log(`[SalaDoFuturo] Todos os dias falharam para a turma ${classId} — mantendo dados locais.`);
      return;
    }

    // Se apenas ALGUNS dias falharam, mesclar com a grade anterior para não
    // regravar a semana inteira com um dia em branco (ex.: terça ausente).
    const anteriores =
      diasFalharam.length > 0
        ? await prisma.classSchedule.findMany({ where: { classId, dayOfWeek: { in: diasFalharam } } })
        : [];

    const porDiaAnterior = new Map<number, AgendaAula[]>();
    for (const s of anteriores) {
      const lista = porDiaAnterior.get(s.dayOfWeek) ?? [];
      lista.push({
        diaDaSemana: s.dayOfWeek,
        horaInicioAula: s.startTime,
        horaFimAula: s.endTime,
        nomeDisciplina: s.subject,
        disciplinaId: s.subjectId,
        turmaId: 1, // marcador: aula já persistida, preservar tal como está
      });
      porDiaAnterior.set(s.dayOfWeek, lista);
    }

    if (porDia.size === 0 && porDiaAnterior.size === 0) {
      console.log(`[SalaDoFuturo] SED nao retornou agenda para a turma ${classId} — mantendo dados locais.`);
      return;
    }

    const plano = new Map<number, AgendaAula[]>(porDia);
    for (const [dia, aulas] of porDiaAnterior) {
      if (!plano.has(dia)) plano.set(dia, aulas);
    }

    await prisma.$transaction(async (tx) => {
      await tx.classSchedule.deleteMany({ where: { classId } });
      const regs: any[] = [];
      for (const [diaDaSemana, aulas] of plano) {
        for (const aula of aulas) {
          const recess = aula.nomeDisciplina.toUpperCase() === 'INTERVALO';
          regs.push({
            classId,
            dayOfWeek: diaDaSemana,
            startTime: aula.horaInicioAula,
            endTime: aula.horaFimAula,
            subject: aula.nomeDisciplina,
            subjectId: aula.disciplinaId,
            isRecess: recess,
          });
        }
      }
      await tx.classSchedule.createMany({ data: regs });
    });

    const total = await prisma.classSchedule.count({ where: { classId } });
    const msgFalha = diasFalharam.length > 0 ? ` (dias com falha mantidos da grade anterior: ${diasFalharam.join(', ')})` : '';
    console.log(`[SalaDoFuturo] Agenda sincronizada: ${total} aulas gravadas para a turma ${classId}${msgFalha}.`);
  } catch (err: any) {
    console.log(`[SalaDoFuturo] Aviso: nao foi possivel sincronizar agenda: ${err.message}`);
  }
}

/**
 * Sincroniza os canais de matéria da turma do aluno real (SED SP) a partir das
 * DISCIPLINAS configuradas no RA — não de uma lista fixa. Roda em todo login.
 *
 * Cria canais para cada disciplina real (com nome amigável) e REMOVE apenas
 * canais de matéria que NÃO pertencem ao RA (ex.: sociologia) quando temos os
 * dados reais. Canais estruturais (geral, dúvidas, avisos-oficiais) e as Salas
 * Online são sempre preservados.
 */
export async function ensureSubjectChannelsForStudent(student: SalaDoFuturoStudent, classId: string) {
  const disciplinas = await listarDisciplinasDoAluno(student);

  // Canais estruturais (sempre presentes e nunca removidos).
  const structural: Array<{ name: string; type: string; isLocked: boolean }> = [
    { name: 'avisos-oficiais', type: 'ANNOUNCEMENT', isLocked: true },
    { name: 'geral', type: 'TEXT', isLocked: false },
    { name: 'dúvidas', type: 'TEXT', isLocked: false },
  ];
  const structuralSlugs = new Set(structural.map((c) => subjectToChannelSlug(c.name)));

  // Matérias "tradicionais" que a antiga grade fixa podia ter criado — usamos
  // isto só para decidir o que pode ser removido com segurança (nada estrutural,
  // nada de voz, nada criado por professor fora destes nomes).
  const oldCurriculumSlugs = new Set([
    'matematica', 'portugues', 'historia', 'geografia', 'ingles', 'artes',
    'educacao-fisica', 'ciencias', 'biologia', 'fisica', 'quimica',
    'filosofia', 'sociologia', 'educacao-financeira', 'redacao-e-leitura',
    'lingua-portuguesa', 'lingua-inglesa',
  ]);

  // Se a API respondeu com disciplinas reais, criar as que faltam e preparar a
  // lista de matérias válidas para remoção.
  if (disciplinas.length > 0) {
    const realSlugs = new Set(disciplinas.map((d) => subjectToChannelSlug(d)));

    for (const nome of disciplinas) {
      const chSlug = subjectToChannelSlug(nome);
      const existe = await prisma.channel.findFirst({
        where: { classId, name: nome },
      });
      if (!existe) {
        await prisma.channel.create({
          data: { classId, name: nome, type: 'TEXT', isLocked: false },
        });
      }
      // Se existir um canal antigo com o MESMO assunto porém outro nome
      // (ex.: "lingua-portuguesa" vs "português"), removê-lo para não duplicar.
      const duplicados = await prisma.channel.findMany({
        where: { classId, type: 'TEXT', name: { not: nome } },
        select: { id: true, name: true },
      });
      for (const d of duplicados) {
        if (chSlug && subjectToChannelSlug(d.name) === chSlug) {
          await prisma.channel.delete({ where: { id: d.id } }).catch(() => {});
        }
      }
    }

    // Remover matérias da grade antiga que NÃO existem no RA real do aluno
    // (ex.: sociologia) e que não são canais estruturais.
    const channels = await prisma.channel.findMany({
      where: { classId, type: 'TEXT' },
      select: { id: true, name: true },
    });
    for (const ch of channels) {
      const chSlug = subjectToChannelSlug(ch.name);
      if (chSlug && !structuralSlugs.has(chSlug) && oldCurriculumSlugs.has(chSlug) && !realSlugs.has(chSlug)) {
        await prisma.channel.delete({ where: { id: ch.id } }).catch(() => {});
      }
    }
  }

  // Garantir os canais estruturais (avisos, geral, dúvidas) e as salas de voz.
  for (const c of structural) {
    const existe = await prisma.channel.findFirst({
      where: { classId, name: c.name },
    });
    if (!existe) {
      await prisma.channel.create({
        data: { classId, name: c.name, type: c.type as any, isLocked: c.isLocked },
      });
    }
  }
  for (const voiceName of ['Sala Online 1', 'Sala Online 2']) {
    const existe = await prisma.channel.findFirst({
      where: { classId, name: voiceName, type: 'VOICE' },
    });
    if (!existe) {
      await prisma.channel.create({
        data: { classId, name: voiceName, type: 'VOICE', isLocked: false },
      });
    }
  }
}

/** URL real de autorização OIDC do gov.br (SED SP / Sala do Futuro) */
export function getGovBrAuthorizationUrl(): string {
  const params = new URLSearchParams({
    client_id: 'seduc.saladofuturo-aluno.ios',
    redirect_uri: 'https://saladofuturo.educacao.sp.gov.br/sso-gov-servidor',
    response_type: 'code',
    scope: 'openid phone email profile',
  });
  return `https://idp.sp.gov.br/auth/realms/idpsp/protocol/openid-connect/auth?${params.toString()}`;
}
