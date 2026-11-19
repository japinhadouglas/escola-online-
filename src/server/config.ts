import dotenv from 'dotenv';
dotenv.config();

export const isProduction = process.env.NODE_ENV === 'production';

// JWT Secret - obrigatório forte em produção
const jwtSecret = process.env.JWT_SECRET;
if (isProduction && (!jwtSecret || jwtSecret.length < 64)) {
  throw new Error(
    'FALHA DE SEGURANÇA: JWT_SECRET deve ter no mínimo 64 caracteres em produção.'
  );
}

// Verificar se segredos de desenvolvimento não estão em produção
if (isProduction && jwtSecret?.includes('dev') || jwtSecret?.includes('insecure')) {
  throw new Error('FALHA DE SEGURANÇA: Segredo de desenvolvimento detectado em produção.');
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: jwtSecret || 'dev-only-escola-online-insecure-secret-do-not-use-in-prod-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h', // Reduzido para 1h
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  // CORS - apenas origens explicitamente permitidas
  allowedOrigins: (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Rate limiting config
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxRequests: isProduction ? 100 : 300,
    // Login: apenas tentativas FALHAS contam (logins corretos não gastam a cota)
    authMaxRequests: isProduction ? 10 : 20,
  },
  // Security headers
  security: {
    hstsMaxAge: 31536000, // 1 ano
    hstsIncludeSubdomains: true,
    hstsPreload: true,
    cspReportOnly: false,
  },
  // Database
  db: {
    connectionLimit: 10,
    idleTimeout: 30000,
  },
  // Session
  session: {
    cookieSecure: isProduction,
    cookieHttpOnly: true,
    cookieSameSite: 'strict' as const,
  },
  // WebRTC/ICE servers
  iceServers: isProduction 
    ? JSON.parse(process.env.ICE_SERVERS || '[]') 
    : [{ urls: 'stun:stun.l.google.com:19302' }],
};