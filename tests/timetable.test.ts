import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/index.js';
import { prisma } from '../src/server/db.js';

describe('4. Grade Horária das Turmas (Timetable)', () => {
  let adminToken: string;
  let studentToken: string;
  let classId: string;

  it('Obter tokens de admin e aluno', async () => {
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'ADMIN01', password: 'admin123' });
    adminToken = adminRes.body.token;

    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'RA202601', password: 'aluno123' });
    studentToken = studentRes.body.token;
  });

  it('Admin cria turma e grade horária é persistida no ClassSchedule', async () => {
    const uniqueCode = `TABELA-${Date.now()}`;
    const res = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Turma Horário Teste',
        grade: '1º Ano',
        shift: 'MANHA',
        code: uniqueCode,
        year: 2026,
      });

    expect(res.status).toBe(201);
    classId = res.body.id;

    await prisma.classSchedule.createMany({
      data: [
        { classId, dayOfWeek: 1, startTime: '07:30:00', endTime: '08:20:00', subject: 'MATEMATICA', subjectId: 101, isRecess: false },
        { classId, dayOfWeek: 1, startTime: '08:20:00', endTime: '09:10:00', subject: 'LINGUA PORTUGUESA', subjectId: 102, isRecess: false },
        { classId, dayOfWeek: 3, startTime: '09:20:00', endTime: '09:40:00', subject: 'INTERVALO', subjectId: -1, isRecess: true },
      ],
    });
  });

  it('Aluno sem matrícula não pode ver a grade (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/classes/${classId}/timetable`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('Admin recebe a grade agrupada por dia da semana', async () => {
    const res = await request(app)
      .get(`/api/v1/classes/${classId}/timetable`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.classId).toBe(classId);
    expect(res.body.className).toBe('Turma Horário Teste');
    expect(res.body.days).toHaveLength(5);

    const segunda = res.body.days.find((d: any) => d.key === 'monday');
    expect(segunda).toBeDefined();
    expect(segunda.label).toBe('Segunda');
    expect(segunda.itens).toHaveLength(2);
    expect(segunda.itens[0].subject).toBe('MATEMATICA');
    expect(segunda.itens[0].startTime).toBe('07:30:00');
    expect(segunda.itens[0].endTime).toBe('08:20:00');

    const quarta = res.body.days.find((d: any) => d.key === 'wednesday');
    expect(quarta.itens).toHaveLength(1);
    expect(quarta.itens[0].isRecess).toBe(true);
    expect(quarta.itens[0].subject).toBe('INTERVALO');
  });

  it('Admin não vê grade (404) para turma inexistente', async () => {
    const res = await request(app)
      .get('/api/v1/classes/id-inexistente/timetable')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});