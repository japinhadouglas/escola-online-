import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { enforceTenantIsolation } from '../middlewares/tenant.js';

export const schoolsRouter = Router();

schoolsRouter.use(authenticateToken);
schoolsRouter.use(enforceTenantIsolation);

// Estatísticas do Dashboard da Escola
schoolsRouter.get('/dashboard-stats', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const schoolId = user.schoolId;

    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      activeSessions,
      totalAssignments,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.user.count({ where: { schoolId, role: 'STUDENT', isActive: true } }),
      prisma.user.count({ where: { schoolId, role: 'TEACHER', isActive: true } }),
      prisma.class.count({ where: { schoolId, isActive: true } }),
      prisma.classroomSession.count({ where: { class: { schoolId }, status: 'ACTIVE' } }),
      prisma.assignment.count({ where: { class: { schoolId } } }),
      prisma.auditLog.findMany({
        where: { schoolId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
      }),
    ]);

    res.json({
      totalStudents,
      totalTeachers,
      totalClasses,
      activeSessions,
      totalAssignments,
      recentActivity: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        userName: log.user?.name || 'Sistema',
        userRole: log.user?.role || 'SYSTEM',
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Dashboard Stats Error]', error);
    res.status(500).json({ error: 'Erro ao carregar estatísticas do painel.' });
  }
});

// Listar escolas (Superadmin / Secretaria de Educação)
schoolsRouter.get('/', requireRole(['SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const schools = await prisma.school.findMany({
      include: {
        _count: {
          select: { users: true, classes: true },
        },
      },
    });

    res.json(schools);
  } catch (error) {
    console.error('[Get Schools Error]', error);
    res.status(500).json({ error: 'Erro ao listar escolas.' });
  }
});
