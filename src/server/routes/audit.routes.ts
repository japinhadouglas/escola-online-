import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middlewares/auth.js';
import { enforceTenantIsolation } from '../middlewares/tenant.js';

export const auditRouter = Router();

auditRouter.use(authenticateToken);
auditRouter.use(enforceTenantIsolation);

// Consultar trilha de auditoria (Admin / Coordenador / Superadmin)
auditRouter.get('/', requireRole(['ADMIN', 'COORDINATOR', 'SUPERADMIN']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { schoolId: user.schoolId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, registrationNumber: true, role: true },
          },
        },
      }),
      prisma.auditLog.count({ where: { schoolId: user.schoolId } }),
    ]);

    res.json({
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        details: log.details ? JSON.parse(log.details) : null,
        user: log.user,
        createdAt: log.createdAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[Audit Logs Error]', error);
    res.status(500).json({ error: 'Erro ao consultar trilha de auditoria.' });
  }
});
