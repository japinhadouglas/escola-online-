import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

// Rate limiter com store em memória (para produção usar Redis)
const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
  skipSuccessful?: boolean; // login: só tentativas falhas contam
}) => rateLimit({
  windowMs: options.windowMs,
  max: options.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: options.message, code: 'RATE_LIMIT_EXCEEDED' },
  keyGenerator: (req) => `${options.keyPrefix}:${req.ip}`,
  skip: (req) => config.isProduction ? false : req.ip === '::1' || req.ip === '127.0.0.1',
  skipSuccessfulRequests: options.skipSuccessful === true,
  handler: (req, res) => {
    res.status(429).json({
      error: options.message,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  },
});

// Limitador geral de API - mais restritivo em produção
export const apiLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Muitas requisições. Tente novamente mais tarde.',
  keyPrefix: 'api',
});

// Limitador rigoroso para autenticação / login anti-brute force
// skipSuccessful: logins CORRETOS não gastam a cota — só senhas erradas contam
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: config.rateLimit.authMaxRequests,
  message: 'Muitas tentativas de login com senha errada. Aguarde 15 minutos.',
  keyPrefix: 'auth',
  skipSuccessful: true,
});

// Limitador para operações sensíveis (mudança de senha, etc)
export const sensitiveLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  message: 'Muitas tentativas. Aguarde 1 hora.',
  keyPrefix: 'sensitive',
});

// Limitador para upload de arquivos
export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20,
  message: 'Limite de uploads excedido. Aguarde 1 hora.',
  keyPrefix: 'upload',
});

// Limitador para WebSocket connections
export const wsLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  message: 'Muitas conexões WebSocket. Aguarde 1 minuto.',
  keyPrefix: 'ws',
});