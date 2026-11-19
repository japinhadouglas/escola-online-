import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/index.js';

describe('2. Controle de Acesso Baseado em Perfis (RBAC)', () => {
  let studentToken: string;
  let teacherToken: string;
  let adminToken: string;

  it('Obter tokens para perfis distintos', async () => {
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'RA202601', password: 'aluno123' });
    studentToken = studentRes.body.token;

    const teacherRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'PROF01', password: 'prof123' });
    teacherToken = teacherRes.body.token;

    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'ADMIN01', password: 'admin123' });
    adminToken = adminRes.body.token;
  });

  it('Aluno NÃO pode criar uma nova turma (deve retornar 403)', async () => {
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        name: 'Turma Criada por Aluno',
        grade: '9º Ano',
        shift: 'MANHA',
        code: '9ANO-HACK',
      });

    expect(res.status).toBe(403);
  });

  it('Aluno NÃO pode acessar a trilha de auditoria LGPD (deve retornar 403)', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('Administrador PODE criar uma nova turma com sucesso (status 201)', async () => {
    const uniqueCode = `TEST-TURMA-${Date.now()}`;
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Turma de Teste Automatizado',
        grade: 'Ensino Médio 1º Ano',
        shift: 'MANHA',
        code: uniqueCode,
        year: 2026,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Turma de Teste Automatizado');
  });
});
