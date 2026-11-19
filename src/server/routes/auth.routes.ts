import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { authLimiter, sensitiveLimiter } from '../middlewares/rateLimiter.js';
import { authenticateToken, AuthenticatedRequest, generateTokens, revokeToken, verifyRefreshToken } from '../middlewares/auth.js';
import { recordAuditLog } from '../services/auditService.js';
import { autenticarSalaDoFuturo, sincronizarAluno, autenticarProfessorSalaDoFuturo, sincronizarProfessor } from '../services/salaDoFuturoService.js';
import { UserRole } from '../../shared/types.js';

export const authRouter = Router();

const loginSchema = z.object({
  identifier: z.string().min(2, 'Informe seu RA, CPF ou matrícula'),
  password: z.string().min(1, 'Informe sua senha'),
  role: z.enum(['student', 'teacher']).optional().default('student'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token obrigatório'),
});

// POST /api/v1/auth/login
authRouter.post('/login', authLimiter, async (req, res): Promise<void> => {
  console.log('[LOGIN] Request received:', { body: { ...req.body, password: '***' }, ip: req.ip });
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message, code: 'VALIDATION_ERROR' });
      return;
    }

    const { identifier, password, role } = parseResult.data;

    let usuario = await prisma.user.findFirst({
      where: role === 'teacher'
        ? { OR: [{ cpf: identifier }, { registrationNumber: identifier }] }
        : { OR: [{ registrationNumber: identifier }, { email: identifier.toLowerCase() }] },
      include: { school: true },
    });

    // Professores: tentar autenticação SED se não existe localmente
    if (!usuario && role === 'teacher') {
      try {
        const dadosProfessor = await autenticarProfessorSalaDoFuturo(identifier, password);
        const { usuario: professorNovo } = await sincronizarProfessor(dadosProfessor, password);
        usuario = await prisma.user.findUnique({
          where: { id: professorNovo.id },
          include: { school: true },
        });
      } catch (err: any) {
        await recordAuditLog({
          schoolId: '',
          action: 'AUTH_LOGIN_FAILED_TEACHER_SED',
          resource: '/api/v1/auth/login',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: { identifier, error: err?.message },
        });
        res.status(401).json({
          error: 'Professor não encontrado. Verifique o CPF e a senha do gov.br.',
          code: 'TEACHER_NOT_FOUND',
        });
        return;
      }
    }

    // Verificar bloqueio
    if (usuario && usuario.lockUntil && usuario.lockUntil > new Date()) {
      const min = Math.ceil((usuario.lockUntil.getTime() - Date.now()) / 60000);
      res.status(429).json({ error: `Conta bloqueada. Tente novamente em ${min} minuto(s).`, code: 'ACCOUNT_LOCKED' });
      return;
    }

    if (usuario) {
      const senhaOk = await bcrypt.compare(password, usuario.passwordHash);
      
      if (senhaOk) {
        // Login bem-sucedido
        await prisma.user.update({
          where: { id: usuario.id },
          data: { failedAttempts: 0, lockUntil: null, lastLoginAt: new Date() },
        });

        // Sincronização SED para alunos reais
        const isRealSedRA = /^\d{5,}SP$/i.test(identifier.trim());
        if (usuario.role === 'STUDENT' && isRealSedRA) {
          try {
            const dadosSalaDoFuturo = await autenticarSalaDoFuturo(identifier, password);
            await sincronizarAluno(dadosSalaDoFuturo, password);
          } catch (err: any) {
            console.warn(`[Login] SED indisponível para ${identifier}: ${err?.message || ''}`);
          }
        }

        // Sincronização para professores com CPF
        const isCpf = /^\d{11}$/.test(identifier.replace(/[^0-9]/g, ''));
        if (usuario.role === 'TEACHER' && isCpf) {
          try {
            const dadosProfessor = await autenticarProfessorSalaDoFuturo(identifier, password);
            await sincronizarProfessor(dadosProfessor, password);
          } catch (err: any) {
            console.warn(`[Login] SED professor indisponível: ${err?.message || ''}`);
          }
        }

        const usuarioFinal = await prisma.user.findUnique({
          where: { id: usuario.id },
          include: { school: true },
        });

        if (!usuarioFinal) {
          res.status(500).json({ error: 'Erro ao carregar dados do usuário.', code: 'USER_LOAD_FAILED' });
          return;
        }

        // Gerar tokens
        const payload = {
          id: usuarioFinal.id,
          schoolId: usuarioFinal.schoolId,
          schoolName: usuarioFinal.school.name,
          registrationNumber: usuarioFinal.registrationNumber,
          name: usuarioFinal.name,
          email: usuarioFinal.email,
          role: usuarioFinal.role as UserRole,
          avatarUrl: usuarioFinal.avatarUrl,
          sedToken: usuarioFinal.sedToken,
          isMonitor: usuarioFinal.isMonitor,
        };

        const { accessToken, refreshToken } = generateTokens(payload);

        await recordAuditLog({
          schoolId: usuarioFinal.schoolId,
          userId: usuarioFinal.id,
          action: 'AUTH_LOGIN_SUCCESS',
          resource: '/api/v1/auth/login',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        // Set secure cookies
        res.cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
          path: '/api/v1/auth',
        });

        res.json({
          message: 'Login realizado com sucesso.',
          token: accessToken,
          accessToken,
          refreshToken,
          user: payload,
        });
        return;
      }

      // Senha incorreta
      const tentativas = usuario.failedAttempts + 1;
      let lockUntil: Date | null = null;
      if (tentativas >= 5) {
        lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min
      }
      await prisma.user.update({
        where: { id: usuario.id },
        data: { failedAttempts: tentativas, lockUntil },
      });

      await recordAuditLog({
        schoolId: usuario.schoolId,
        userId: usuario.id,
        action: 'AUTH_LOGIN_FAILED_PASSWORD',
        resource: '/api/v1/auth/login',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { attempts: tentativas, locked: !!lockUntil },
      });

      if (tentativas < 5) {
        res.status(401).json({ 
          error: 'Senha incorreta. Verifique sua senha.', 
          code: 'INVALID_PASSWORD',
          attemptsRemaining: 5 - tentativas,
        });
        return;
      }

      res.status(429).json({ 
        error: 'Conta bloqueada após 5 tentativas incorretas. Aguarde 15 minutos.', 
        code: 'ACCOUNT_LOCKED' 
      });
      return;
    }

    // Usuário não encontrado localmente - apenas alunos podem tentar SED
    if (role !== 'student') {
      await recordAuditLog({
        schoolId: '',
        action: 'AUTH_LOGIN_FAILED_TEACHER_NOT_FOUND',
        resource: '/api/v1/auth/login',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { identifier },
      });
      res.status(401).json({
        error: 'Não foi possível autenticar. Verifique suas credenciais.',
        code: 'USER_NOT_FOUND',
      });
      return;
    }

    // Fluxo aluno SED direto
    let dadosSalaDoFuturo;
    try {
      dadosSalaDoFuturo = await autenticarSalaDoFuturo(identifier, password);
    } catch (err: any) {
      await recordAuditLog({
        schoolId: '',
        action: 'AUTH_LOGIN_FAILED_STUDENT_SED',
        resource: '/api/v1/auth/login',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { identifier, error: err?.message },
      });
      res.status(401).json({ error: err.message, code: 'SED_AUTH_FAILED' });
      return;
    }

    const { usuario: novoUsuario, escola, turma } = await sincronizarAluno(dadosSalaDoFuturo, password);

    const usuarioFinal = await prisma.user.findUnique({
      where: { id: novoUsuario.id },
      include: { school: true },
    });

    if (!usuarioFinal) {
      res.status(500).json({ error: 'Erro interno ao criar usuário.', code: 'USER_CREATE_FAILED' });
      return;
    }

    const payload = {
      id: usuarioFinal.id,
      schoolId: usuarioFinal.schoolId,
      schoolName: usuarioFinal.school.name,
      registrationNumber: usuarioFinal.registrationNumber,
      name: usuarioFinal.name,
      email: usuarioFinal.email,
      role: usuarioFinal.role as UserRole,
      avatarUrl: usuarioFinal.avatarUrl,
      sedToken: usuarioFinal.sedToken,
      isMonitor: usuarioFinal.isMonitor,
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    await recordAuditLog({
      schoolId: usuarioFinal.schoolId,
      userId: usuarioFinal.id,
      action: 'AUTH_LOGIN_SUCCESS_SED',
      resource: '/api/v1/auth/login',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { turma: turma.name, escola: escola.name },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    res.json({
      message: `Bem-vindo(a), ${payload.name}! Matriculado na turma ${turma.name}.`,
      token: accessToken,
      accessToken,
      user: payload,
    });
  } catch (error) {
    console.error('[Login Error]', error);
    await recordAuditLog({
      schoolId: '',
      action: 'AUTH_LOGIN_ERROR',
      resource: '/api/v1/auth/login',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { error: error instanceof Error ? error.message : 'unknown' },
    });
    res.status(500).json({ error: 'Erro interno ao realizar autenticação.', code: 'INTERNAL_ERROR' });
  }
});

// POST /api/v1/auth/refresh - Renovar access token
authRouter.post('/refresh', sensitiveLimiter, async (req, res): Promise<void> => {
  try {
    const parseResult = refreshSchema.safeParse(req.body);
    const refreshToken = parseResult.success ? parseResult.data.refreshToken : req.cookies?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token obrigatório.', code: 'NO_REFRESH_TOKEN' });
      return;
    }

    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      res.status(401).json({ error: 'Refresh token inválido ou expirado.', code: 'INVALID_REFRESH_TOKEN' });
      return;
    }

    // Verificar se usuário ainda existe e está ativo
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { school: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Usuário inativo.', code: 'USER_INACTIVE' });
      return;
    }

    // Revogar refresh token antigo
    revokeToken(refreshToken);

    // Gerar novos tokens
    const newPayload = {
      id: user.id,
      schoolId: user.schoolId,
      schoolName: user.school.name,
      registrationNumber: user.registrationNumber,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      avatarUrl: user.avatarUrl,
      sedToken: user.sedToken,
      isMonitor: user.isMonitor,
    };

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(newPayload);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    res.json({ accessToken });
  } catch (error) {
    console.error('[Refresh Error]', error);
    res.status(500).json({ error: 'Erro ao renovar token.', code: 'REFRESH_ERROR' });
  }
});

// POST /api/v1/auth/logout
authRouter.post('/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      revokeToken(refreshToken);
    }

    // Revogar access token atual
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (accessToken) {
      revokeToken(accessToken);
    }

    await recordAuditLog({
      schoolId: req.user!.schoolId,
      userId: req.user!.id,
      action: 'AUTH_LOGOUT',
      resource: '/api/v1/auth/logout',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
    });

    res.json({ message: 'Logout realizado com sucesso.' });
  } catch (error) {
    console.error('[Logout Error]', error);
    res.status(500).json({ error: 'Erro ao fazer logout.', code: 'LOGOUT_ERROR' });
  }
});

// GET /api/v1/auth/me - Dados do usuário autenticado
authRouter.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        school: true,
        enrollments: {
          include: {
            class: {
              include: { channels: true },
            },
          },
        },
      },
    });

    if (!usuario) {
      res.status(404).json({ error: 'Usuário não encontrado.', code: 'USER_NOT_FOUND' });
      return;
    }

    res.json({
      id: usuario.id,
      name: usuario.name,
      registrationNumber: usuario.registrationNumber,
      email: usuario.email,
      role: usuario.role,
      avatarUrl: usuario.avatarUrl,
      sedToken: usuario.sedToken,
      isMonitor: usuario.isMonitor,
      school: {
        id: usuario.school.id,
        name: usuario.school.name,
        code: usuario.school.code,
        city: usuario.school.city,
        state: usuario.school.state,
        type: usuario.school.type,
      },
      classes: usuario.enrollments.map((e) => ({
        id: e.class.id,
        name: e.class.name,
        grade: e.class.grade,
        shift: e.class.shift,
        code: e.class.code,
        role: e.role,
        subject: e.subject,
        channels: e.class.channels.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          isLocked: c.isLocked,
        })),
      })),
    });
  } catch (error) {
    console.error('[Me Error]', error);
    res.status(500).json({ error: 'Erro ao obter dados do usuário.', code: 'ME_ERROR' });
  }
});

// GET /api/v1/auth/govbr/authorize - URL para login Gov.br
authRouter.get('/govbr/authorize', async (_req, res): Promise<void> => {
  try {
    const { getGovBrAuthorizationUrl } = await import('../services/salaDoFuturoService.js');
    const authUrl = getGovBrAuthorizationUrl();
    res.json({ authorizationUrl: authUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao gerar URL de autorização do gov.br.', code: 'GOVBR_URL_ERROR' });
  }
});