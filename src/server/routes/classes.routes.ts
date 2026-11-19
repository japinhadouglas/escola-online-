import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { enforceTenantIsolation } from '../middlewares/tenant.js';
import { recordAuditLog } from '../services/auditService.js';

export const classesRouter = Router();

classesRouter.use(authenticateToken);
classesRouter.use(enforceTenantIsolation);

// Listar turmas
classesRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    if (user.role === 'ADMIN' || user.role === 'COORDINATOR' || user.role === 'SUPERADMIN' || user.role === 'TEACHER') {
      const classes = await prisma.class.findMany({
        where: { schoolId: user.schoolId },
        include: {
          channels: true,
          enrollments: {
            include: {
              user: {
                select: { id: true, name: true, role: true, avatarUrl: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      res.json(
        classes.map((c) => ({
          id: c.id,
          name: c.name,
          grade: c.grade,
          shift: c.shift,
          year: c.year,
          code: c.code,
          channels: c.channels,
          roleInClass: c.enrollments.find((e) => e.userId === user.id)?.role || null,
          subject: c.enrollments.find((e) => e.userId === user.id)?.subject || null,
          studentCount: c.enrollments.filter((e) => e.role === 'STUDENT').length,
          teacherNames: c.enrollments.filter((e) => e.role === 'TEACHER').map((e) => e.user.name),
        }))
      );
      return;
    }

    // Para Alunos e Professores, retornar as turmas matriculadas
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: user.id },
      include: {
        class: {
          include: {
            channels: true,
            enrollments: {
              include: {
                user: {
                  select: { id: true, name: true, role: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
    });

    res.json(
      enrollments.map((e) => ({
        id: e.class.id,
        name: e.class.name,
        grade: e.class.grade,
        shift: e.class.shift,
        year: e.class.year,
        code: e.class.code,
        roleInClass: e.role,
        subject: e.subject,
        channels: e.class.channels,
        studentCount: e.class.enrollments.filter((en) => en.role === 'STUDENT').length,
        teacherNames: e.class.enrollments.filter((en) => en.role === 'TEACHER').map((en) => en.user.name),
      }))
    );
  } catch (error) {
    console.error('[Get Classes Error]', error);
    res.status(500).json({ error: 'Erro ao carregar turmas.' });
  }
});

// Detalhes de uma turma específica
classesRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const targetClass = await prisma.class.findUnique({
      where: { id },
      include: {
        channels: true,
        enrollments: {
          select: {
            id: true,
            userId: true,
            role: true,
            subject: true,
            user: {
              select: {
                id: true,
                name: true,
                role: true,
                registrationNumber: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
        },
        materials: {
          orderBy: { createdAt: 'desc' },
          include: {
            uploader: { select: { id: true, name: true } },
          },
        },
        assignments: {
          orderBy: { createdAt: 'desc' },
          include: {
            teacher: { select: { id: true, name: true } },
            submissions: {
              where: user.role === 'STUDENT' ? { studentId: user.id } : undefined,
            },
          },
        },
        sessions: {
          where: { status: 'ACTIVE' },
          include: {
            teacher: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!targetClass || targetClass.schoolId !== user.schoolId) {
      res.status(404).json({ error: 'Turma não encontrada ou acesso negado.' });
      return;
    }

    // Verificar se o aluno está matriculado (professores visualizam todas as turmas da escola)
    if (user.role === 'STUDENT') {
      const isEnrolled = targetClass.enrollments.some((e) => e.userId === user.id);
      if (!isEnrolled) {
        res.status(403).json({ error: 'Você não está matriculado nesta turma.' });
        return;
      }
    }

    res.json(targetClass);
  } catch (error) {
    console.error('[Get Class Details Error]', error);
    res.status(500).json({ error: 'Erro ao buscar detalhes da turma.' });
  }
});

// Grade horária (timetable) de uma turma
classesRouter.get('/:id/timetable', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const targetClass = await prisma.class.findUnique({
      where: { id },
      include: {
        enrollments: { select: { userId: true, role: true } },
        schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    });

    if (!targetClass || targetClass.schoolId !== user.schoolId) {
      res.status(404).json({ error: 'Turma não encontrada ou acesso negado.' });
      return;
    }

    // Apenas matriculados na turma (alunos) ou membros da escola com acesso
    // (professores, coordenação e admin) podem ver a grade.
    const canView =
      user.role === 'ADMIN' ||
      user.role === 'COORDINATOR' ||
      user.role === 'SUPERADMIN' ||
      user.role === 'TEACHER' ||
      targetClass.enrollments.some((e) => e.userId === user.id);
    if (!canView) {
      res.status(403).json({ error: 'Você não tem acesso à grade desta turma.' });
      return;
    }

    const days = [
      { key: 'monday', label: 'Segunda', value: 1 },
      { key: 'tuesday', label: 'Terça', value: 2 },
      { key: 'wednesday', label: 'Quarta', value: 3 },
      { key: 'thursday', label: 'Quinta', value: 4 },
      { key: 'friday', label: 'Sexta', value: 5 },
    ];

    const grouped = days.map((d) => ({
      key: d.key,
      label: d.label,
      value: d.value,
      itens: targetClass.schedules
        .filter((s) => s.dayOfWeek === d.value)
        .map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          subject: s.subject,
          subjectId: s.subjectId,
          isRecess: s.isRecess,
        })),
    }));

    res.json({
      classId: targetClass.id,
      className: targetClass.name,
      period: targetClass.shift,
      days: grouped,
    });
  } catch (error) {
    console.error('[Get Timetable Error]', error);
    res.status(500).json({ error: 'Erro ao carregar a grade horária.' });
  }
});

// Criar nova turma (Admin / Coordenador)
const createClassSchema = z.object({
  name: z.string().min(2, 'Nome da turma obrigatório'),
  grade: z.string().min(2, 'Série obrigatória'),
  shift: z.enum(['MANHA', 'TARDE', 'NOITE', 'INTEGRAL']).default('MANHA'),
  year: z.number().int().default(2026),
  code: z.string().min(2, 'Código único da turma obrigatório'),
});

classesRouter.post('/', requireRole(['ADMIN', 'COORDINATOR', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createClassSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { name, grade, shift, year, code } = parseResult.data;
    const user = req.user!;

    // Criar turma e canais padrão
    const newClass = await prisma.class.create({
      data: {
        schoolId: user.schoolId,
        name,
        grade,
        shift,
        year,
        code,
        channels: {
          create: [
            { name: 'geral', type: 'TEXT' },
            { name: 'avisos', type: 'ANNOUNCEMENT', isLocked: true },
            { name: 'duvidas', type: 'TEXT' },
          ],
        },
      },
      include: {
        channels: true,
      },
    });

    recordAuditLog({
      schoolId: user.schoolId,
      userId: user.id,
      action: 'CLASS_CREATED',
      resource: `/api/v1/classes/${newClass.id}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name, code },
    });

    res.status(201).json(newClass);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Já existe uma turma cadastrada com este código.' });
      return;
    }
    console.error('[Create Class Error]', error);
    res.status(500).json({ error: 'Erro ao criar turma.' });
  }
});

// Criar canal na turma (Professor / Coordenador / Admin)
classesRouter.post('/:id/channels', requireRole(['TEACHER', 'COORDINATOR', 'ADMIN', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, type = 'TEXT', isLocked = false } = req.body;
    const user = req.user!;

    const targetClass = await prisma.class.findUnique({
      where: { id },
      include: { enrollments: true },
    });

    if (!targetClass || targetClass.schoolId !== user.schoolId) {
      res.status(404).json({ error: 'Turma não encontrada.' });
      return;
    }

    // Professor só pode criar canal na turma em que está cadastrado como docente
    if (user.role === 'TEACHER') {
      const isTeaching = targetClass.enrollments.some(
        (e) => e.userId === user.id && e.role === 'TEACHER'
      );
      if (!isTeaching) {
        res.status(403).json({ error: 'Você não é professor desta turma.' });
        return;
      }
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const channel = await prisma.channel.create({
      data: {
        classId: id,
        name: cleanName,
        type,
        isLocked,
      },
    });

    res.status(201).json(channel);
  } catch (error) {
    console.error('[Create Channel Error]', error);
    res.status(500).json({ error: 'Erro ao criar canal de comunicação.' });
  }
});

// Mensagens de um canal
classesRouter.get('/:id/channels/:channelId/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id, channelId } = req.params;
    const user = req.user!;

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, classId: id, class: { schoolId: user.schoolId } },
      include: { class: { include: { enrollments: true } } },
    });

    if (!channel) {
      res.status(404).json({ error: 'Canal não encontrado.' });
      return;
    }

    if (user.role === 'STUDENT') {
      const isEnrolled = channel.class.enrollments.some((e) => e.userId === user.id);
      if (!isEnrolled) {
        res.status(403).json({ error: 'Acesso não autorizado às mensagens da turma.' });
        return;
      }
    }

    const messages = await prisma.message.findMany({
      where: { channelId },
      include: {
        sender: {
          select: { id: true, name: true, role: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    res.json(
      messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.sender.id,
        senderName: m.sender.name,
        senderRole: m.sender.role,
        senderAvatar: m.sender.avatarUrl,
        content: m.content,
        attachments: m.attachments ? JSON.parse(m.attachments) : [],
        isPinned: m.isPinned,
        createdAt: m.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('[Get Messages Error]', error);
    res.status(500).json({ error: 'Erro ao carregar mensagens do canal.' });
  }
});

// Enviar mensagem no canal
classesRouter.post('/:id/channels/:channelId/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id, channelId } = req.params;
    const { content, attachments } = req.body;
    const user = req.user!;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'A mensagem não pode estar vazia.' });
      return;
    }

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, classId: id, class: { schoolId: user.schoolId } },
      include: { class: { include: { enrollments: true } } },
    });

    if (!channel) {
      res.status(404).json({ error: 'Canal não encontrado.' });
      return;
    }

    // Se canal for bloqueado para avisos, apenas professores, coordenação e admin podem postar
    if (channel.isLocked && user.role === 'STUDENT') {
      res.status(403).json({ error: 'Apenas professores e a coordenação podem enviar mensagens neste canal de avisos.' });
      return;
    }

    const message = await prisma.message.create({
      data: {
        channelId,
        senderId: user.id,
        content: content.trim(),
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true, avatarUrl: true },
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
      content: message.content,
      attachments: message.attachments ? JSON.parse(message.attachments) : [],
      isPinned: message.isPinned,
      createdAt: message.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[Send Message Error]', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});
