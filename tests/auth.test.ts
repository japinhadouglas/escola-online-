import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Mock do serviço SED SP para tornar os testes determinísticos (sem depender
// da rede/estado real da SED). O fluxo local (RA202601 / PROF01) não usa rede.
vi.mock('../src/server/services/salaDoFuturoService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    autenticarSalaDoFuturo: vi.fn(async (ra: string) => {
      throw new Error(`RA ${ra} não encontrado na SED SP (mock).`);
    }),
    autenticarProfessorSalaDoFuturo: vi.fn(async (cpf: string) => {
      throw new Error(`CPF ${cpf} não encontrado na SED SP (mock).`);
    }),
  };
});

import { app } from '../src/server/index.js';

describe('1. Autenticação e Segurança de Acesso', () => {
  it('Deve realizar login com sucesso para aluno usando RA e senha', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'RA202601', password: 'aluno123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('role', 'STUDENT');
    expect(res.body.user).toHaveProperty('name', 'Lucas Silva');
  });

  it('Deve realizar login com sucesso para professor usando Matrícula e senha', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'PROF01', password: 'prof123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('role', 'TEACHER');
  });

  it('Deve rejeitar senha incorreta com status 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'RA202601', password: 'senha_totalmente_errada' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('Deve rejeitar RA inexistente com status 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'RA_NAO_EXISTE_999', password: 'senha' });

    expect(res.status).toBe(401);
  });
});
