import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.js';
import { prisma } from '../db.js';

export const materiaisRouter = Router();

materiaisRouter.use(authenticateToken);

const BFF = 'https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi';
const BFF_HEADERS: Record<string, string> = {
  'Accept': 'application/json, text/plain, */*',
  'ocp-apim-subscription-key': 'd701a2043aa24d7ebb37e9adf60d043b',
  'x-product-name': 'SalaDoFuturo',
  'Origin': 'https://saladofuturo.educacao.sp.gov.br',
  'Referer': 'https://saladofuturo.educacao.sp.gov.br/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

interface ConteudoSed {
  id: number;
  titulo: string;
  observacao: string | null;
  subcategoria: string;
  arquivos: Array<{
    arquivoId: number;
    descricao: string;
    tipoArquivo: string;
    link: string;
    duracao: number | null;
  }>;
}

/**
 * GET /api/v1/materiais
 *
 * 1. Matérias reais do aluno (canais de texto da turma dele)
 * 2. Conteúdos digitais da conta SED SP (mural de avisos/conteúdo digital),
 *    puxados do BFF com o token + cookie de sessão salvos no login.
 */
materiaisRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // ---- 1. Matérias do aluno (das turmas matriculadas) ----
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      include: { class: { include: { channels: true } } },
    });
    const materias = new Map<string, { nome: string; turma: string }>();
    for (const e of enrollments) {
      for (const ch of e.class.channels) {
        if ((ch.type === 'TEXT' || ch.type === 'ANNOUNCEMENT') && !ch.isLocked) {
          if (!materias.has(ch.name)) {
            materias.set(ch.name, { nome: ch.name, turma: e.class.name });
          }
        }
      }
    }

    // ---- 2. Conteúdos digitais da conta SED ----
    let conteudos: ConteudoSed[] = [];
    let sessaoValida = false;
    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { sedToken: true, sedCookie: true },
    });

    if (usuario?.sedToken && usuario?.sedCookie) {
      try {
        const headers = {
          ...BFF_HEADERS,
          Authorization: `Bearer ${usuario.sedToken}`,
          Cookie: usuario.sedCookie,
        };
        const r = await fetch(`${BFF}/muralavisosapi/api/conteudo-digital/listar-subcategoria`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (r.ok) {
          const data = (await r.json()) as any;
          if (data?.success && Array.isArray(data.data)) {
            conteudos = data.data.map((item: any) => ({
              id: item.id,
              titulo: item.titulo || 'Conteúdo',
              observacao: item.observacao || null,
              subcategoria: item.subcategoria || 'Geral',
              arquivos: (item.arquivos || []).map((a: any) => ({
                arquivoId: a.arquivoId,
                descricao: a.descricao || a.tipoArquivo || 'Arquivo',
                tipoArquivo: a.tipoArquivo || 'Arquivo',
                link: a.link,
                duracao: a.duracao ?? null,
              })),
            }));
            sessaoValida = true;
          }
        }
      } catch (err: any) {
        console.warn(`[Materiais] BFF indisponível: ${err?.message || err}`);
      }
    }

    res.json({
      materias: [...materias.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
      conteudos,
      sessaoSedValida: sessaoValida,
      linkOficial: 'https://saladofuturo.educacao.sp.gov.br/plataformas',
    });
  } catch (error) {
    console.error('[Materiais] Erro ao listar:', error);
    res.status(500).json({ error: 'Erro ao carregar materiais.', code: 'MATERIAIS_ERRO' });
  }
});