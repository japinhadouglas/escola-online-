import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.js';
import { prisma } from '../db.js';

export const presencaRouter = Router();

presencaRouter.use(authenticateToken);

interface FrequenciaOficial {
  bimestre: number;
  bimestreAtual: boolean;
  porcentagemPresenca: number;
  porcentagemFaltas: number;
  numeroFaltasBimestre: number;
  totalAulasBimestre: number;
  sincronizadoEm?: string;
}

/**
 * GET /api/v1/presenca
 * Retorna a última frequência OFICIAL da SED SP sincronizada (snapshot),
 * quando disponível. A página de Presença usa isso para preencher os cards.
 */
presencaRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const usuario = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { frequencySnapshot: true },
    });

    let oficial: FrequenciaOficial | null = null;
    if (usuario?.frequencySnapshot) {
      try {
        oficial = JSON.parse(usuario.frequencySnapshot);
      } catch {
        oficial = null;
      }
    }

    res.json({
      oficial, // null quando ainda não há sincronização com a CMSP
      linkOficial: 'https://saladofuturo.educacao.sp.gov.br/presenca',
      atualizadoEm: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Presenca] Erro ao listar:', error);
    res.status(500).json({ error: 'Erro ao carregar sua presença.', code: 'PRESENCA_ERRO' });
  }
});