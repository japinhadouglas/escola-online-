import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// HANDLERS GLOBAIS DE ERRO - PRIMEIRA COISA A CARREGAR
// ============================================================================
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[UNHANDLED REJECTION]', reason?.message || reason);
  console.error(reason?.stack || '');
  // Em produção, não matar o processo - apenas logar
  if (process.env.NODE_ENV === 'production') {
    // Enviar para serviço de monitoramento (Sentry, etc)
  }
});

process.on('uncaughtException', (err: Error) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message);
  console.error(err.stack);
  // Em produção, gravar crash dump e encerrar graciosamente
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// ============================================================================
// IMPORTS
// ============================================================================
import { config } from './config.js';
import { apiLimiter, authLimiter, sensitiveLimiter, uploadLimiter } from './middlewares/rateLimiter.js';
import { authRouter } from './routes/auth.routes.js';
import { classesRouter } from './routes/classes.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { assignmentsRouter } from './routes/assignments.routes.js';
import { materialsRouter } from './routes/materials.routes.js';
import { schoolsRouter } from './routes/schools.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { tarefasRouter } from './routes/tarefas.routes.js';
import { presencaRouter } from './routes/presenca.routes.js';
import { materiaisRouter } from './routes/materiais.routes.js';
import { mentoriaRouter } from './routes/mentoria.routes.js';

import { setupWebRTCSignaling, handleUserLeaveClassroom } from './socket/webrtcSignaling.js';
import { setupClassroomHandler } from './socket/classroomHandler.js';
import { setupWhiteboardHandler } from './socket/whiteboardHandler.js';
import { setupChatHandler } from './socket/chatHandler.js';
import { UserRole, UserSession } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
export const server = http.createServer(app);

// ============================================================================
// ANTI-DOS / CONNECTION HARDENING
// ============================================================================
server.on('clientError', (_err: Error, socket: NodeJS.Socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {}
});

server.on('error', (err: Error) => {
  console.error('[HTTP] Server error:', err.message);
});

server.on('connection', (socket: NodeJS.Socket) => {
  socket.on('error', () => { /* conexão abortada */ });
  // Timeout para conexões ociosas
  (socket as any).setTimeout(30000);
});

// ============================================================================
// CORS - ORIGIN VALIDATION RIGOROSA
// ============================================================================
const devOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const allowedOrigins = new Set<string>([...config.allowedOrigins, ...devOrigins]);

function isOriginAllowed(origin: string | undefined): boolean {
  // Sem cabeçalho Origin = requisição não-browser (curl, health check, proxy, server-side).
  // CORS só protege navegadores; requests sem Origin não carregam credenciais cross-origin.
  if (!origin) {
    return true;
  }
  // Túneis gratuitos do Cloudflare (site rodando no PC do usuário via cloudflared).
  // A URL muda a cada reinício do túnel, então aceitamos qualquer subdomínio.
  if (origin.endsWith('.trycloudflare.com')) {
    return true;
  }
  return allowedOrigins.has(origin);
}

// Trust proxy para obter IP real atrás de load balancer
if (config.isProduction) {
  app.set('trust proxy', 1);
}

// ============================================================================
// SOCKET.IO COM AUTENTICAÇÃO E RATE LIMITING
// ============================================================================
export const io = new Server(server, {
  cors: {
    origin: isOriginAllowed,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 10000,
  maxHttpBufferSize: 1e6, // 1MB max message size
});

// Rate limiting para WebSocket connections
const wsConnections = new Map<string, { count: number; resetTime: number }>();

io.use((socket: Socket, next) => {
  const ip = socket.handshake.address;
  const now = Date.now();
  
  const conn = wsConnections.get(ip) || { count: 0, resetTime: now + 60000 };
  if (now > conn.resetTime) {
    conn.count = 0;
    conn.resetTime = now + 60000;
  }
  conn.count++;
  wsConnections.set(ip, conn);
  
  if (conn.count > 30) {
    return next(new Error('Muitas conexões deste IP'));
  }
  
  next();
});

// ============================================================================
// HELMET - SECURITY HEADERS MÁXIMOS
// ============================================================================
app.use(
  helmet({
    // HSTS - forçar HTTPS
    hsts: config.isProduction ? {
      maxAge: config.security.hstsMaxAge,
      includeSubDomains: config.security.hstsIncludeSubdomains,
      preload: config.security.hstsPreload,
    } : false,
    
    // CSP - Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'"], // unsafe-eval necessário para React dev
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        fontSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https:'],
        mediaSrc: ["'self'", 'blob:', 'mediastream:', 'https:'],
        childSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        frameAncestors: ["'none'"], // Prevenir clickjacking
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
        objectSrc: ["'none'"], // Prevenir plugins
        frameSrc: ["'none'"],
      },
    },
    
    // Outros headers de segurança
    crossOriginEmbedderPolicy: false, // WebRTC precisa
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  })
);

// ============================================================================
// CORS
// ============================================================================
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin as string | undefined)) {
        callback(null, true);
      } else {
        callback(new Error('Origem não permitida.'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400, // 24h cache preflight
  })
);

// ============================================================================
// BODY PARSERS COM LIMITES
// ============================================================================
app.use(express.json({ 
  limit: '5mb',
  strict: true,
  verify: (req, _res, buf) => {
    // Armazenar raw body para webhooks se necessário
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '5mb',
  parameterLimit: 100,
}));

// ============================================================================
// SECURITY MIDDLEWARES
// ============================================================================

// 1. Request logging com sanitização
app.use((req, res, next) => {
  const start = Date.now();
  const sanitizedPath = req.path.replace(/\/api\/v1\/auth\/.*/, '/api/v1/auth/***'); // Não logar endpoints sensíveis
  console.log(`[REQUEST] ${req.method} ${sanitizedPath} from ${req.ip}`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[SLOW REQUEST] ${req.method} ${sanitizedPath} took ${duration}ms`);
    }
  });
  next();
});

// 2. Sanitização de input
import { sanitizeInput } from './middlewares/auth.js';
app.use(sanitizeInput);

// 3. Headers de segurança customizados
app.use((_req, res, next) => {
  // Remover headers que vazam informação
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  // Headers de segurança adicionais
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  next();
});

// 4. Rate limiting global
app.use('/api/', apiLimiter);

// ============================================================================
// HEALTH CHECK (sem rate limiting)
 // ============================================================================
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Escola Online API v1',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ============================================================================
// ROTAS DA API v1
 // ============================================================================
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/classes', classesRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/assignments', assignmentsRouter);
app.use('/api/v1/materials', uploadLimiter, materialsRouter);
app.use('/api/v1/schools', schoolsRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/tarefas', tarefasRouter);
app.use('/api/v1/presenca', presencaRouter);
app.use('/api/v1/materiais', materiaisRouter);
app.use('/api/v1/mentoria', mentoriaRouter);

// ============================================================================
// PRODUÇÃO - SERVIR FRONTEND
 // ============================================================================
if (config.isProduction) {
  const clientDist = path.resolve(__dirname, '../../client');
  
  // Security headers para assets estáticos
  app.use(express.static(clientDist, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
  
  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ============================================================================
// RESPONSE SAFETY - GARANTIR JSON VÁLIDO
 // ============================================================================
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  let responseSent = false;
  
  res.json = (body: any) => {
    if (!responseSent) {
      responseSent = true;
      const safeBody = body === undefined || body === null ? { success: true } : body;
      return originalJson(safeBody);
    }
    return res;
  };
  
  const originalEnd = res.end.bind(res);
  res.end = (chunk?: any, encoding?: any) => {
    if (!responseSent && !res.headersSent) {
      responseSent = true;
      if (chunk === undefined || chunk === null || chunk === '') {
        return originalJson({ success: true });
      }
    }
    return originalEnd(chunk, encoding);
  };
  
  next();
});

// ============================================================================
// ERROR HANDLERS - SEMPRE RETORNAR JSON
 // ============================================================================

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[GLOBAL ERROR]', {
    message: err.message,
    stack: err.stack,
    name: err.name,
  });
  
  if (res.headersSent) return _next(err);
  
  const status = (err as any).statusCode || (err as any).status || 500;
  const code = (err as any).code || 'INTERNAL_ERROR';
  const message = config.isProduction 
    ? (status === 500 ? 'Erro interno do servidor' : err.message)
    : err.message;
  
  res.status(status).json({ error: message, code });
});

// 404 handler
app.use((_req: express.Request, res: express.Response) => {
  if (res.headersSent) return;
  res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
});

// Safety net
app.use((_req: express.Request, res: express.Response) => {
  if (!res.headersSent) {
    console.warn('[SAFETY] Unhandled route');
    res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
  }
});

// ============================================================================
// SOCKET.IO AUTH & HANDLERS
 // ============================================================================
io.use((socket: Socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Autenticação necessária'));
  
  try {
    const payload = jwt.verify(token, config.jwtSecret) as UserSession;
    (socket as any).user = payload;
    next();
  } catch {
    next(new Error('Token inválido ou expirado'));
  }
});

io.on('connection', (socket) => {
  const user = (socket as any).user as UserSession;
  console.log(`[SOCKET] ${user.name} connected (${user.role})`);
  
  // Rate limiting por socket
  let messageCount = 0;
  const resetInterval = setInterval(() => { messageCount = 0; }, 1000);
  
  socket.onAny(() => {
    messageCount++;
    if (messageCount > 100) {
      socket.disconnect(true);
    }
  });
  
  socket.on('disconnect', () => {
    clearInterval(resetInterval);
    handleUserLeaveClassroom(io, socket);
  });
  
  setupWebRTCSignaling(io, socket);
  setupClassroomHandler(io, socket);
  setupWhiteboardHandler(io, socket);
  setupChatHandler(io, socket);
});

// ============================================================================
// SERVER STARTUP
 // ============================================================================
if (process.env.NODE_ENV !== 'test') {
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 ESCOLA ONLINE — Server Active on port ${config.port}`);
    console.log(`🌐 API: http://localhost:${config.port}/api/v1`);
    console.log(`🔒 Multi-Tenant Security: ENABLED`);
    console.log(`🛡️  Security: HELMET + CORS + RATE LIMIT + CSP + HSTS`);
    console.log(`=======================================================`);
  });
  
  server.on('error', (err) => console.error('[SERVER ERROR]', err));
}