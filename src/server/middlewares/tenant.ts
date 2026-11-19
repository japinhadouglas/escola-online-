import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { recordAuditLog } from '../services/auditService.js';

export function enforceTenantIsolation(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }

  // Se o usuário for SUPERADMIN, pode transitar entre tenants (ex: Secretaria de Educação)
  if (req.user.role === 'SUPERADMIN') {
    return next();
  }

  const requestedSchoolId = req.params.schoolId || req.query.schoolId || req.body?.schoolId;

  if (requestedSchoolId && requestedSchoolId !== req.user.schoolId) {
    recordAuditLog({
      schoolId: req.user.schoolId,
      userId: req.user.id,
      action: 'SECURITY_IDOR_BLOCKED',
      resource: req.originalUrl,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        attemptedSchoolId: requestedSchoolId,
        userSchoolId: req.user.schoolId,
        method: req.method,
      },
    });

    res.status(403).json({
      error: 'Violação de isolamento escolar. Acesso negado a dados de outra instituição.',
    });
    return;
  }

  next();
}
