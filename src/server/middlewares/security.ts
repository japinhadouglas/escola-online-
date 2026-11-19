import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { UserRole } from '../../shared/types.js';

// ============================================================================
// SECURITY MIDDLEWARES
// ============================================================================

// Lista de tokens revogados (em producao usar Redis)
const revokedTokens = new Set<string>();

export function revokeToken(token: string): void {
  revokedTokens.add(token);
}

// Sanitizacao de input para prevenir prototype pollution
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
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

  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  if (req.params) req.params = clean(req.params);
  next();
}

// Middleware para validar Content-Type
export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      res.status(415).json({ 
        error: 'Content-Type deve ser application/json', 
        code: 'UNSUPPORTED_MEDIA_TYPE' 
      });
      return;
    }
  }
  next();
}

// Middleware para limitar tamanho do body
export function bodySizeLimit(maxSize: number = 5 * 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxSize) {
      res.status(413).json({ 
        error: 'Payload muito grande', 
        code: 'PAYLOAD_TOO_LARGE',
        maxSize: `${maxSize / 1024 / 1024}MB` 
      });
      return;
    }
    next();
  };
}

// Middleware para prevenir clickjacking
export function frameguard(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none';");
  next();
}

// Middleware para validar se usuario tem acesso a escola (multi-tenant)
export async function requireSchoolAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Nao autenticado.', code: 'NOT_AUTHENTICATED' });
    return;
  }

  // Verificar se a escola do recurso corresponde a escola do usuario
  const resourceSchoolId = req.params.schoolId || req.body.schoolId || req.query.schoolId;
  
  if (resourceSchoolId && resourceSchoolId !== user.schoolId) {
    res.status(403).json({ 
      error: 'Acesso negado. Recurso de outra escola.', 
      code: 'CROSS_SCHOOL_ACCESS_DENIED' 
    });
    return;
  }

  next();
}

// Middleware para validar ownership de recurso
export async function requireOwnership(
  getResourceSchoolId: (req: Request) => Promise<string | null>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Nao autenticado.', code: 'NOT_AUTHENTICATED' });
      return;
    }

    const resourceSchoolId = await getResourceSchoolId(req);
    if (resourceSchoolId && resourceSchoolId !== user.schoolId) {
      res.status(403).json({ 
        error: 'Acesso negado. Recurso nao pertence a sua escola.', 
        code: 'OWNERSHIP_DENIED' 
      });
      return;
    }

    next();
  };
}

// Role-based access control
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Nao autenticado.', code: 'NOT_AUTHENTICATED' });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ 
        error: 'Permissao insuficiente.', 
        code: 'INSUFFICIENT_ROLE',
        required: allowedRoles,
        current: user.role 
      });
      return;
    }

    next();
  };
}

// Middleware para auditoria de acoes sensiveis
export function auditAction(action: string, resource: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    
    if (!user) return next();
    
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const { recordAuditLog } = await import('../services/auditService.js');
          await recordAuditLog({
            schoolId: user.schoolId,
            userId: user.id,
            action,
            resource,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            details: { method: req.method, path: req.path },
          });
        } catch {}
      }
    });
    
    next();
  };
}

// Middleware para validacao de parametros de paginacao
export function validatePagination(req: Request, res: Response, next: NextFunction): void {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  
  if (page < 1) {
    res.status(400).json({ error: 'Pagina deve ser >= 1', code: 'INVALID_PAGE' });
    return;
  }
  
  if (limit < 1 || limit > 100) {
    res.status(400).json({ error: 'Limite deve ser entre 1 e 100', code: 'INVALID_LIMIT' });
    return;
  }
  
  (req as any).pagination = { page, limit, offset: (page - 1) * limit };
  next();
}

// Middleware para sanitizar saida (prevenir XSS em JSON)
export function sanitizeOutput(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  
  res.json = (body: any) => {
    // Sanitizar strings no response
    function sanitize(obj: any): any {
      if (typeof obj === 'string') {
        const sq = '\'';
        return obj
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"')
          .replace(/'/g, sq);
      }
      if (Array.isArray(obj)) return obj.map(sanitize);
      if (obj && typeof obj === 'object') {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
          cleaned[key] = sanitize(value);
        }
        return cleaned;
      }
      return obj;
    }
    
    return originalJson(sanitize(body));
  };
  
  next();
}

// Middleware para detectar tentativas de injecao
export function detectInjection(req: Request, res: Response, next: NextFunction): void {
  const suspicious = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|script)\b)/i,
    /(<script|javascript:|on\w+\s*=)/i,
    /(\$\{|\$\()/, // Template injection
  ];

  function check(obj: any, path: string = ''): boolean {
    if (typeof obj === 'string') {
      return suspicious.some(pattern => pattern.test(obj));
    }
    if (Array.isArray(obj)) {
      return obj.some((item, i) => check(item, `${path}[${i}]`));
    }
    if (obj && typeof obj === 'object') {
      return Object.entries(obj).some(([key, value]) => check(value, `${path}.${key}`));
    }
    return false;
  }

  if (check(req.body, 'body') || check(req.query, 'query') || check(req.params, 'params')) {
    console.warn('[SECURITY] Possible injection attempt:', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
    });
    // Log mas nao bloquear (false positives)
  }

  next();
}

// Middleware para rate limiting por usuario (nao IP)
export function userRateLimit(maxRequests: number, windowMs: number) {
  const userRequests = new Map<string, { count: number; resetTime: number }>();
  
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of userRequests.entries()) {
      if (now > data.resetTime) userRequests.delete(key);
    }
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    const key = user?.id || req.ip;
    
    if (!key) return next();
    
    const now = Date.now();
    const data = userRequests.get(key) || { count: 0, resetTime: now + windowMs };
    
    if (now > data.resetTime) {
      data.count = 0;
      data.resetTime = now + windowMs;
    }
    
    data.count++;
    userRequests.set(key, data);
    
    if (data.count > maxRequests) {
      res.status(429).json({
        error: 'Muitas requisicoes. Aguarde.',
        code: 'USER_RATE_LIMIT',
        retryAfter: Math.ceil((data.resetTime - now) / 1000),
      });
      return;
    }
    
    res.setHeader('X-User-RateLimit-Limit', maxRequests);
    res.setHeader('X-User-RateLimit-Remaining', Math.max(0, maxRequests - data.count));
    res.setHeader('X-User-RateLimit-Reset', new Date(data.resetTime).toISOString());
    
    next();
  };
}