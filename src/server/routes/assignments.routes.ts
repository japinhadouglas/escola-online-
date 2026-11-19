import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { enforceTenantIsolation } from '../middlewares/tenant.js';

export const assignmentsRouter = Router();

assignmentsRouter.use(authenticateToken);
assignmentsRouter.use(enforceTenantIsolation);

const createAssignmentSchema = z.object({
  classId: z.string().min(1, 'Turma obrigatória'),
  title: z.string().min(2, 'Título obrigatório'),
  description: z.string().min(5, 'Descrição obrigatória'),
  subject: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  maxScore: z.number().default(10),
  attachments: z.array(z.any()).optional(),
});

// Criar atividade (Professor / Coordenação)
assignmentsRouter.post('/', requireRole(['TEACHER', 'COORDINATOR', 'ADMIN', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createAssignmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { classId, title, description, subject, dueDate, maxScore, attachments } = parseResult.data;
    const user = req.user!;

    // Verificar se a turma pertence à mesma escola
    const targetClass = await prisma.class.findFirst({
      where: { id: classId, schoolId: user.schoolId },
    });

    if (!targetClass) {
      res.status(404).json({ error: 'Turma não encontrada.' });
      return;
    }

    // Professor só pode publicar atividade na turma em que está cadastrado como docente
    if (user.role === 'TEACHER') {
      const teaching = await prisma.enrollment.findFirst({
        where: { userId: user.id, classId, role: 'TEACHER' },
      });
      if (!teaching) {
        res.status(403).json({ error: 'Você não é professor desta turma.' });
        return;
      }
    }

    const assignment = await prisma.assignment.create({
      data: {
        classId,
        teacherId: user.id,
        title,
        description,
        subject: subject || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        maxScore,
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error('[Create Assignment Error]', error);
    res.status(500).json({ error: 'Erro ao criar atividade.' });
  }
});

// Enviar resposta/entrega de atividade (Aluno)
assignmentsRouter.post('/:id/submit', requireRole(['STUDENT']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content, attachments } = req.body;
    const user = req.user!;

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: { class: true },
    });

    if (!assignment || assignment.class.schoolId !== user.schoolId) {
      res.status(404).json({ error: 'Atividade não encontrada.' });
      return;
    }

    const submission = await prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: id,
          studentId: user.id,
        },
      },
      update: {
        content: content || '',
        attachments: attachments ? JSON.stringify(attachments) : null,
        submittedAt: new Date(),
      },
      create: {
        assignmentId: id,
        studentId: user.id,
        content: content || '',
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
    });

    res.json(submission);
  } catch (error) {
    console.error('[Submit Assignment Error]', error);
    res.status(500).json({ error: 'Erro ao enviar atividade.' });
  }
});

// Avaliar entrega (Professor)
assignmentsRouter.post('/:id/grade/:submissionId', requireRole(['TEACHER', 'COORDINATOR', 'ADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id, submissionId } = req.params;
    const { score, feedback } = req.body;

    const submission = await prisma.assignmentSubmission.update({
      where: { id: submissionId, assignmentId: id },
      data: {
        score: typeof score === 'number' ? score : null,
        feedback: feedback || null,
      },
    });

    res.json(submission);
  } catch (error) {
    console.error('[Grade Submission Error]', error);
    res.status(500).json({ error: 'Erro ao registrar nota da atividade.' });
  }
});
