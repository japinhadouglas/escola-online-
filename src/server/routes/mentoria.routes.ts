import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.js';
import { enforceTenantIsolation } from '../middlewares/tenant.js';

export const mentoriaRouter = Router();

mentoriaRouter.use(authenticateToken);
mentoriaRouter.use(enforceTenantIsolation);

/**
 * GET /api/v1/mentoria/channel/:classId
 * Retorna o canal de mentoria da turma (só monitores podem acessar)
 */
mentoriaRouter.get('/channel/:classId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { classId } = req.params;
    const user = req.user!;

    // Verificar se usuário é monitor
    if (!user.isMonitor) {
      res.status(403).json({ error: 'Acesso restrito a monitores.', code: 'NOT_MONITOR' });
      return;
    }

    // Verificar se a turma existe e pertence à escola do usuário
    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: { school: true },
    });

    if (!targetClass || targetClass.schoolId !== user.schoolId) {
      res.status(404).json({ error: 'Turma não encontrada.', code: 'CLASS_NOT_FOUND' });
      return;
    }

    // Buscar ou criar canal de mentoria
    let mentorChannel = await prisma.channel.findFirst({
      where: { classId, name: 'mentoria' },
    });

    if (!mentorChannel) {
      // Criar canal de mentoria (bloqueado para não-monitores)
      mentorChannel = await prisma.channel.create({
        data: {
          classId,
          name: 'mentoria',
          type: 'TEXT',
          isLocked: true, // Só monitores (via verificação no frontend/backend) podem postar
        },
      });
    }

    // Buscar mensagens do canal
    const messages = await prisma.message.findMany({
      where: { channelId: mentorChannel.id },
      include: {
        sender: {
          select: { id: true, name: true, role: true, avatarUrl: true, isMonitor: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    res.json({
      channel: {
        id: mentorChannel.id,
        name: mentorChannel.name,
        type: mentorChannel.type,
        isLocked: mentorChannel.isLocked,
      },
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.sender.id,
        senderName: m.sender.name,
        senderRole: m.sender.role,
        senderAvatar: m.sender.avatarUrl,
        senderIsMonitor: m.sender.isMonitor,
        content: m.content,
        attachments: m.attachments ? JSON.parse(m.attachments) : [],
        isPinned: m.isPinned,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Mentoria] Erro ao buscar canal:', error);
    res.status(500).json({ error: 'Erro ao carregar canal de mentoria.', code: 'MENTORIA_ERROR' });
  }
});

/**
 * POST /api/v1/mentoria/channel/:classId/messages
 * Enviar mensagem no canal de mentoria (só monitores)
 */
mentoriaRouter.post('/channel/:classId/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { classId } = req.params;
    const { content, attachments } = req.body;
    const user = req.user!;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'A mensagem não pode estar vazia.', code: 'EMPTY_MESSAGE' });
      return;
    }

    // Verificar se usuário é monitor
    if (!user.isMonitor) {
      res.status(403).json({ error: 'Apenas monitores podem enviar mensagens na mentoria.', code: 'NOT_MONITOR' });
      return;
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: { school: true },
    });

    if (!targetClass || targetClass.schoolId !== user.schoolId) {
      res.status(404).json({ error: 'Turma não encontrada.', code: 'CLASS_NOT_FOUND' });
      return;
    }

    // Buscar canal de mentoria
    let mentorChannel = await prisma.channel.findFirst({
      where: { classId, name: 'mentoria' },
    });

    if (!mentorChannel) {
      mentorChannel = await prisma.channel.create({
        data: {
          classId,
          name: 'mentoria',
          type: 'TEXT',
          isLocked: true,
        },
      });
    }

    const message = await prisma.message.create({
      data: {
        channelId: mentorChannel.id,
        senderId: user.id,
        content: content.trim(),
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true, avatarUrl: true, isMonitor: true },
        },
      },
    });

    res.status(201).json({
      id: message.id,
      channelId: message.channelId,
      senderId: message.sender.id,
      senderName: message.sender.name,
      senderRole: message.sender.role,
      senderAvatar: message.sender.avatarUrl,
      senderIsMonitor: message.sender.isMonitor,
      content: message.content,
      attachments: message.attachments ? JSON.parse(message.attachments) : [],
      isPinned: message.isPinned,
      createdAt: message.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[Mentoria] Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem.', code: 'MENTORIA_SEND_ERROR' });
  }
});

/**
 * GET /api/v1/mentoria/monitors/:classId
 * Lista monitores da turma/escola (só monitores podem ver)
 */
mentoriaRouter.get('/monitors/:classId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { classId } = req.params;
    const user = req.user!;

    if (!user.isMonitor) {
      res.status(403).json({ error: 'Acesso restrito a monitores.', code: 'NOT_MONITOR' });
      return;
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        enrollments: {
          where: { user: { isMonitor: true } },
          include: {
            user: {
              select: { id: true, name: true, registrationNumber: true, avatarUrl: true, role: true, isMonitor: true },
            },
          },
        },
      },
    });

    if (!targetClass || targetClass.schoolId !== user.schoolId) {
      res.status(404).json({ error: 'Turma não encontrada.', code: 'CLASS_NOT_FOUND' });
      return;
    }

    // Também buscar monitores da escola que não estão nessa turma específica
    const schoolMonitors = await prisma.user.findMany({
      where: { schoolId: user.schoolId, isMonitor: true, isActive: true },
      select: { id: true, name: true, registrationNumber: true, avatarUrl: true, role: true, isMonitor: true },
    });

    const classMonitorIds = new Set(targetClass.enrollments.map((e) => e.user.id));
    const otherMonitors = schoolMonitors.filter((m) => !classMonitorIds.has(m.id));

    res.json({
      classMonitors: targetClass.enrollments.map((e) => ({
        ...e.user,
        inClass: true,
        subject: e.subject,
      })),
      otherMonitors,
    });
  } catch (error) {
    console.error('[Mentoria] Erro ao listar monitores:', error);
    res.status(500).json({ error: 'Erro ao carregar monitores.', code: 'MENTORIA_MONITORS_ERROR' });
  }
});

/**
 * POST /api/v1/mentoria/set-monitor
 * (Admin/Coordenador) Define/remove status de monitor de um aluno
 */
mentoriaRouter.post('/set-monitor', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId, isMonitor } = req.body;
    const user = req.user!;

    // Apenas ADMIN, COORDINATOR, SUPERADMIN podem alterar
    if (!['ADMIN', 'COORDINATOR', 'SUPERADMIN'].includes(user.role)) {
      res.status(403).json({ error: 'Permissão negada.', code: 'FORBIDDEN' });
      return;
    }

    if (typeof isMonitor !== 'boolean') {
      res.status(400).json({ error: 'Campo isMonitor (boolean) é obrigatório.', code: 'VALIDATION_ERROR' });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser || targetUser.schoolId !== user.schoolId) {
      res.status(404).json({ error: 'Usuário não encontrado na sua escola.', code: 'USER_NOT_FOUND' });
      return;
    }

    if (targetUser.role !== 'STUDENT') {
      res.status(400).json({ error: 'Apenas alunos podem ser monitores.', code: 'INVALID_ROLE' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isMonitor },
      select: { id: true, name: true, registrationNumber: true, isMonitor: true },
    });

    res.json({ message: `Status de monitor ${isMonitor ? 'ativado' : 'desativado'} para ${updated.name}.`, user: updated });
  } catch (error) {
    console.error('[Mentoria] Erro ao alterar monitor:', error);
    res.status(500).json({ error: 'Erro ao atualizar status de monitor.', code: 'MENTORIA_UPDATE_ERROR' });
  }
});