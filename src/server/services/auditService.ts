import { prisma } from '../db.js';

export interface CreateAuditLogParams {
  schoolId?: string;
  userId?: string;
  action: string;
  resource: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export async function recordAuditLog(params: CreateAuditLogParams) {
  try {
    // Sem schoolId válido, não grava (FK com School). Só loga no console.
    if (!params.schoolId || params.schoolId.trim() === '') {
      console.log('[AuditLog]', params.action, params.resource, params.details || '');
      return;
    }
    await prisma.auditLog.create({
      data: {
        schoolId: params.schoolId,
        userId: params.userId || null,
        action: params.action,
        resource: params.resource,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        details: params.details ? JSON.stringify(params.details) : null,
      },
    });
  } catch (error) {
    console.error('[AuditLog Error]', error);
  }
}