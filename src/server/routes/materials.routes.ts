import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { enforceTenantIsolation } from '../middlewares/tenant.js';

export const materialsRouter = Router();

materialsRouter.use(authenticateToken);
materialsRouter.use(enforceTenantIsolation);

const createMaterialSchema = z.object({
  classId: z.string().min(1, 'Turma obrigatória'),
  title: z.string().min(2, 'Título obrigatório'),
  description: z.string().optional(),
  fileUrl: z.string().min(1, 'URL ou conteúdo do arquivo obrigatório'),
  fileType: z.string().default('PDF'),
  fileSize: z.string().optional(),
});

// Adicionar material de aula (Professor / Coordenação)
materialsRouter.post('/', requireRole(['TEACHER', 'COORDINATOR', 'ADMIN', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createMaterialSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { classId, title, description, fileUrl, fileType, fileSize } = parseResult.data;
    const user = req.user!;

    const targetClass = await prisma.class.findFirst({
      where: { id: classId, schoolId: user.schoolId },
    });

    if (!targetClass) {
      res.status(404).json({ error: 'Turma não encontrada.' });
      return;
    }

    // Professor só pode disponibilizar material na turma em que está cadastrado como docente
    if (user.role === 'TEACHER') {
      const teaching = await prisma.enrollment.findFirst({
        where: { userId: user.id, classId, role: 'TEACHER' },
      });
      if (!teaching) {
        res.status(403).json({ error: 'Você não é professor desta turma.' });
        return;
      }
    }

    const material = await prisma.material.create({
      data: {
        classId,
        uploaderId: user.id,
        title,
        description: description || null,
        fileUrl,
        fileType,
        fileSize: fileSize || null,
      },
    });

    res.status(201).json(material);
  } catch (error) {
    console.error('[Create Material Error]', error);
    res.status(500).json({ error: 'Erro ao disponibilizar material.' });
  }
});
