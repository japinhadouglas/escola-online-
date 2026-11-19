import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.js';
import { recordAuditLog } from '../services/auditService.js';
import { sincronizarTarefasDoAluno } from '../services/tarefasService.js';
import { prisma } from '../db.js';

export const tarefasRouter = Router();

async function getTarefasDoBanco(userId: string) {
  const tarefas = await prisma.studentTask.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
  });

  const counts = { pendentes: 0, finalizadas: 0, expiradas: 0 };
  const agora = new Date();
  for (const t of tarefas) {
    if (t.status === 'finished') counts.finalizadas++;
    else if (t.publishAt && t.dueAt && t.dueAt < agora) counts.expiradas++;
    else counts.pendentes++;
  }

  return { tarefas, counts };
}

/**
 * GET /api/v1/tarefas — retorna AS TAREFAS SALVAS NO BANCO imediatamente (rápido).
 * A sincronização com a CMSP roda separado em POST /sync.
 */
tarefasRouter.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { sedToken: true } });

    const { tarefas, counts } = await getTarefasDoBanco(userId);

    res.json({
      tarefas,
      counts,
      sincronizadoEm: new Date().toISOString(),
      sessaoValida: !!usuario?.sedToken,
      frequencia: null,
      fromCache: true,
    });
  } catch (err: any) {
    console.error('[Tarefas] Erro ao listar do banco:', err?.message || err);
    res.status(500).json({ error: 'Erro ao carregar suas tarefas.', code: 'TAREFAS_ERRO' });
  }
});

/**
 * POST /api/v1/tarefas/sync — força sincronização com a CMSP (pode demorar ~60s).
 */
tarefasRouter.post('/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const resultado = await sincronizarTarefasDoAluno(userId);

    // Salva o snapshot da frequência oficial para a página de Presença
    if (resultado.frequencia) {
      await prisma.user.update({
        where: { id: userId },
        data: { frequencySnapshot: JSON.stringify(resultado.frequencia) },
      }).catch(() => {});
    }

    recordAuditLog({
      schoolId: req.user!.schoolId,
      userId,
      action: 'TAREFAS_SINCRONIZACAO',
      resource: '/api/v1/tarefas/sync',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { total: resultado.tarefas.length, counts: resultado.counts },
    });

    res.json(resultado);
  } catch (err: any) {
    console.error('[Tarefas] Erro ao sincronizar:', err?.message || err);

    // Fallback: tenta retornar tarefas salvas no banco local
    try {
      const { tarefas, counts } = await getTarefasDoBanco(req.user!.id);

      const mensagem = (err?.message || 'Erro interno ao buscar suas tarefas.')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      const sugerirReLogin = mensagem.toLowerCase().includes('token') || mensagem.toLowerCase().includes('sessão');

      res.status(sugerirReLogin ? 401 : 200).json({
        tarefas,
        counts,
        sincronizadoEm: new Date().toISOString(),
        sessaoValida: false,
        erro: mensagem,
        code: sugerirReLogin ? 'SESSAO_CMSP_INVALIDA' : 'TAREFAS_INDISPONIVEIS',
        offline: true,
      });
    } catch {
      const mensagem = (err?.message || 'Erro interno ao buscar suas tarefas.')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      const sugerirReLogin = mensagem.toLowerCase().includes('token') || mensagem.toLowerCase().includes('sessão');

      res.status(sugerirReLogin ? 401 : 502).json({
        error: mensagem,
        code: sugerirReLogin ? 'SESSAO_CMSP_INVALIDA' : 'TAREFAS_INDISPONIVEIS',
      });
    }
  }
});