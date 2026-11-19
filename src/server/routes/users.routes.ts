import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { enforceTenantIsolation } from '../middlewares/tenant.js';
import { recordAuditLog } from '../services/auditService.js';
import { syncSubjectChannelsForClass } from '../services/subjectChannels.js';

export const usersRouter = Router();

usersRouter.use(authenticateToken);
usersRouter.use(enforceTenantIsolation);

// Listar usuários da escola (Admin / Coordenador / Professor)
usersRouter.get('/', requireRole(['ADMIN', 'COORDINATOR', 'TEACHER', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const roleFilter = req.query.role as string;

    const users = await prisma.user.findMany({
      where: {
        schoolId: user.schoolId,
        ...(roleFilter ? { role: roleFilter } : {}),
      },
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        email: true,
        role: true,
        avatarUrl: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        enrollments: {
          include: {
            class: {
              select: { id: true, name: true, grade: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(users);
  } catch (error) {
    console.error('[Get Users Error]', error);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// Cadastrar usuário individual
const createUserSchema = z.object({
  name: z.string().min(2, 'Nome completo obrigatório'),
  registrationNumber: z.string().min(2, 'RA ou Matrícula obrigatório'),
  email: z.string().email('E-mail inválido').optional().nullable(),
  password: z.string().min(6, 'A senha provisória deve ter no mínimo 6 caracteres'),
  role: z.enum(['STUDENT', 'TEACHER', 'COORDINATOR', 'ADMIN']).default('STUDENT'),
  classId: z.string().optional(),
  subject: z.string().optional(),
});

usersRouter.post('/', requireRole(['ADMIN', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { name, registrationNumber, email, password, role, classId, subject } = parseResult.data;
    const adminUser = req.user!;

    // Verificar se RA já existe na mesma escola
    const existing = await prisma.user.findUnique({
      where: {
        schoolId_registrationNumber: {
          schoolId: adminUser.schoolId,
          registrationNumber,
        },
      },
    });

    if (existing) {
      res.status(400).json({ error: 'Já existe um usuário cadastrado com este RA/Matrícula nesta escola.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        schoolId: adminUser.schoolId,
        name,
        registrationNumber,
        email: email || null,
        passwordHash,
        role,
      },
    });

    // Se informou turma para matricular imediatamente
    if (classId) {
      await prisma.enrollment.create({
        data: {
          userId: newUser.id,
          classId,
          role: role === 'TEACHER' ? 'TEACHER' : 'STUDENT',
          subject: subject || null,
        },
      });

      // Sincronizar canais de matéria automaticamente a partir das matérias dos professores
      if (role === 'TEACHER' && subject) {
        await syncSubjectChannelsForClass(classId, prisma);
      }
    }

    recordAuditLog({
      schoolId: adminUser.schoolId,
      userId: adminUser.id,
      action: 'USER_CREATED',
      resource: `/api/v1/users/${newUser.id}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name, registrationNumber, role },
    });

    res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      registrationNumber: newUser.registrationNumber,
      email: newUser.email,
      role: newUser.role,
    });
  } catch (error) {
    console.error('[Create User Error]', error);
    res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
});

// Importação em lote de alunos/professores
usersRouter.post('/batch', requireRole(['ADMIN', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { users } = req.body as { users: Array<{ name: string; registrationNumber: string; role: string; email?: string; defaultPassword?: string; classCode?: string }> };

    if (!Array.isArray(users) || users.length === 0) {
      res.status(400).json({ error: 'Lista de usuários inválida para importação.' });
      return;
    }

    const adminUser = req.user!;
    const validRoles: Array<string> = ['STUDENT', 'TEACHER', 'COORDINATOR', 'ADMIN'];
    let successCount = 0;
    const errors: string[] = [];

    for (const item of users) {
      try {
        // Valida o papel contra uma lista fechada (impede injeção de roles arbitrárias).
        const role = (item.role || 'STUDENT').toUpperCase();
        if (!validRoles.includes(role)) {
          errors.push(`Usuário ${item.name} (${item.registrationNumber}): papel inválido "${item.role}".`);
          continue;
        }

        // Exige uma senha inicial forte ou usa um padrão já exportado com alerta.
        const password = item.defaultPassword || 'Escola2026!';
        if (!item.defaultPassword) {
          errors.push(`Usuário ${item.name} (${item.registrationNumber}) importado: troque a senha padrão no primeiro acesso.`);
        }
        const passwordHash = await bcrypt.hash(password, 10);

        const created = await prisma.user.upsert({
          where: {
            schoolId_registrationNumber: {
              schoolId: adminUser.schoolId,
              registrationNumber: item.registrationNumber,
            },
          },
          update: {
            name: item.name,
            email: item.email || null,
          },
          create: {
            schoolId: adminUser.schoolId,
            name: item.name,
            registrationNumber: item.registrationNumber,
            email: item.email || null,
            passwordHash,
            role,
          },
        });

        if (item.classCode) {
          const targetClass = await prisma.class.findFirst({
            where: { schoolId: adminUser.schoolId, code: item.classCode },
          });

          if (targetClass) {
            await prisma.enrollment.upsert({
              where: {
                userId_classId: {
                  userId: created.id,
                  classId: targetClass.id,
                },
              },
              update: {},
              create: {
                userId: created.id,
                classId: targetClass.id,
                role,
              },
            });
          }
        }

        successCount++;
      } catch (err: any) {
        errors.push(`Erro ao importar ${item.name} (${item.registrationNumber}): ${err.message}`);
      }
    }

    recordAuditLog({
      schoolId: adminUser.schoolId,
      userId: adminUser.id,
      action: 'USERS_BATCH_IMPORT',
      resource: '/api/v1/users/batch',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { totalAttempted: users.length, successCount, errorsCount: errors.length },
    });

    res.json({
      message: `Importação finalizada. ${successCount} usuário(s) processados com sucesso.`,
      successCount,
      errors,
    });
  } catch (error) {
    console.error('[Batch Import Error]', error);
    res.status(500).json({ error: 'Erro ao processar importação em lote.' });
  }
});

// Redefinir senha de um usuário
usersRouter.post('/:id/reset-password', requireRole(['ADMIN', 'COORDINATOR', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const adminUser = req.user!;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser || targetUser.schoolId !== adminUser.schoolId) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    // Hierarquia de papéis: impede que um perfil reset a senha de outro com
    // hierarquia igual ou superior (ex.: coordenador resetando senha de admin).
    const roleRank: Record<string, number> = {
      STUDENT: 0,
      TEACHER: 1,
      COORDINATOR: 2,
      ADMIN: 3,
      SUPERADMIN: 4,
    };
    const actorRank = roleRank[adminUser.role] ?? 0;
    const targetRank = roleRank[targetUser.role] ?? 0;

    if (targetRank >= actorRank) {
      res.status(403).json({ error: 'Você não tem permissão para redefinir a senha deste usuário.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        failedAttempts: 0,
        lockUntil: null,
      },
    });

    recordAuditLog({
      schoolId: adminUser.schoolId,
      userId: adminUser.id,
      action: 'USER_PASSWORD_RESET',
      resource: `/api/v1/users/${id}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { targetUserId: id, targetUserName: targetUser.name },
    });

    res.json({ message: `Senha redefinida com sucesso para o usuário ${targetUser.name}.` });
  } catch (error) {
    console.error('[Reset Password Error]', error);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});
