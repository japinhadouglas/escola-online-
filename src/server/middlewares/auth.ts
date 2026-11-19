import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { UserRole, UserSession } from '../../shared/types.js';
import { recordAuditLog } from '../services/auditService.js';

export interface AuthenticatedRequest extends Request {
  user?: UserSession;
}

interface JWTPayload extends UserSession {
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

// Lista de tokens revogados (em produção usar Redis)
const revokedTokens = new Set<string>();

// Limpar tokens expirados periodicamente
setInterval(() => {
  const now = Date.now();
  for (const token of revokedTokens) {
    try {
      const payload = jwt.decode(token) as JWTPayload | null;
      if (payload && payload.exp * 1000 < now) {
        revokedTokens.delete(token);
      }
    } catch {
      revokedTokens.delete(token);
    }
  }
}, 60 * 60 * 1000); // A cada hora

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Acesso não autorizado. Faça login para continuar.', code: 'NO_TOKEN' });
    return;
  }

  // Verificar se token foi revogado
  if (revokedTokens.has(token)) {
    res.status(401).json({ error: 'Sessão revogada. Faça login novamente.', code: 'TOKEN_REVOKED' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;

    // Verificar tipo do token
    if (payload.type !== 'access') {
      res.status(401).json({ error: 'Token inválido para esta operação.', code: 'INVALID_TOKEN_TYPE' });
      return;
    }

    // Verificar se o usuário ainda existe e está ativo
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        schoolId: true,
        role: true,
        isActive: true,
        name: true,
        registrationNumber: true,
        email: true,
        avatarUrl: true,
        lastLoginAt: true,
        isMonitor: true,
      },
    });

    if (!user || !user.isActive) {
      await recordAuditLog({
        schoolId: payload.schoolId,
        userId: payload.id,
        action: 'AUTH_FAILED_INACTIVE_USER',
        resource: req.path,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { reason: 'user_not_found_or_inactive' },
      });
      res.status(401).json({ error: 'Usuário inativo ou não encontrado.', code: 'USER_INACTIVE' });
      return;
    }

    // Verificar se a escola está ativa
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { isActive: true, id: true },
    });

    if (!school || !school.isActive) {
      await recordAuditLog({
        schoolId: payload.schoolId,
        userId: payload.id,
        action: 'AUTH_FAILED_INACTIVE_SCHOOL',
        resource: req.path,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(403).json({ error: 'Acesso negado. Escola inativa.', code: 'SCHOOL_INACTIVE' });
      return;
    }

    // Atualizar último acesso (async, não bloqueia)
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => {});

    req.user = {
      id: user.id,
      schoolId: user.schoolId,
      registrationNumber: user.registrationNumber,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      avatarUrl: user.avatarUrl,
      // O banco é a fonte atual da verdade; o JWT pode ter sido emitido antes
      // de um administrador ativar ou remover o status de monitor.
      isMonitor: user.isMonitor,
    };

    next();
  } catch (err: any) {
    const isExpired = err.name === 'TokenExpiredError';
    const message = isExpired ? 'Sessão expirada. Faça login novamente.' : 'Sessão inválida. Faça login novamente.';
    const code = isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';

    await recordAuditLog({
      schoolId: '',
      action: 'AUTH_FAILED_INVALID_TOKEN',
      resource: req.path,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { error: err.name },
    });

    res.status(401).json({ error: message, code });
  }
}

// Revogar token (logout)
export function revokeToken(token: string): void {
  revokedTokens.add(token);
}

// Middleware para verificar roles
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado.', code: 'NOT_AUTHENTICATED' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      recordAuditLog({
        schoolId: req.user.schoolId,
        userId: req.user.id,
        action: 'AUTH_FORBIDDEN_ROLE',
        resource: req.path,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { requiredRoles: allowedRoles, userRole: req.user.role },
      });
      res.status(403).json({ error: 'Você não tem permissão para acessar este recurso.', code: 'FORBIDDEN' });
      return;
    }

    next();
  };
}

// Middleware para verificar se usuário pertence à mesma escola (multi-tenant)
export function requireSameSchool() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado.', code: 'NOT_AUTHENTICATED' });
      return;
    }

    // Verificar se o recurso pertence à mesma escola do usuário
    // Implementar conforme necessário nas rotas específicas
    next();
  };
}

// Gerar tokens de acesso e refresh
export function generateTokens(user: UserSession): { accessToken: string; refreshToken: string } {
  const accessPayload: JWTPayload = {
    ...user,
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hora
  };

  const refreshPayload: JWTPayload = {
    ...user,
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 dias
  };

  const accessToken = jwt.sign(accessPayload, config.jwtSecret);
  const refreshToken = jwt.sign(refreshPayload, config.jwtSecret);

  return { accessToken, refreshToken };
}

// Verificar refresh token
export async function verifyRefreshToken(token: string): Promise<JWTPayload | null> {
  if (revokedTokens.has(token)) return null;

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
    if (payload.type !== 'refresh') return null;
    return payload;
  } catch {
    return null;
  }
}

// Middleware de validação de entrada sanitizada
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Remover campos potencialmente perigosos
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  
  function clean(obj: any): any {
    if (Array.isArray(obj)) return obj.map(clean);
    if (obj && typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!dangerous.includes(key)) {
          cleaned[key] = clean(value);
        }
      }
      return cleaned;
    }
    return obj;
  }

  req.body = clean(req.body);
  req.query = clean(req.query);
  req.params = clean(req.params);
  next();
}
