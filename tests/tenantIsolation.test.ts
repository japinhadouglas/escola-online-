import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/index.js';

describe('3. Isolamento Multi-Tenant e Prevenção de IDOR / BOLA', () => {
  let userSchool1Token: string;
  let userSchool2Token: string;

  it('Autenticar alunos de escolas distintas', async () => {
    // Escola 1: Santos Dumont
    const res1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'RA202601', password: 'aluno123' });
    userSchool1Token = res1.body.token;

    // Escola 2: Tiradentes
    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'RA999999', password: 'aluno123' });
    userSchool2Token = res2.body.token;
  });

  it('Usuário da Escola 1 tentando forçar schoolId da Escola 2 deve ser bloqueado com 403', async () => {
    const res = await request(app)
      .get('/api/v1/classes?schoolId=escola-id-diferente')
      .set('Authorization', `Bearer ${userSchool1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Violação de isolamento escolar');
  });

  it('Usuário da Escola 2 NÃO deve visualizar turmas pertencentes à Escola 1', async () => {
    const res = await request(app)
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${userSchool2Token}`);

    expect(res.status).toBe(200);
    // Deve retornar apenas turmas em que o aluno da Escola 2 está matriculado (zero para o 8º Ano A da Escola 1)
    const hasClassFromSchool1 = res.body.some((c: any) => c.code === '8ANO-A');
    expect(hasClassFromSchool1).toBe(false);
  });
});
