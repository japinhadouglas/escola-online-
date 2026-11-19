import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
    console.log('🌱 Iniciando Seed do Banco de Dados Escola Online...');
    // Limpar dados anteriores
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.material.deleteMany();
    await prisma.assignmentSubmission.deleteMany();
    await prisma.assignment.deleteMany();
    await prisma.classroomSession.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.class.deleteMany();
    await prisma.user.deleteMany();
    await prisma.school.deleteMany();
    await prisma.department.deleteMany();
    // 1. Criar Secretaria de Educação
    const department = await prisma.department.create({
        data: {
            name: 'Secretaria Municipal de Educação de São Paulo',
            state: 'SP',
            city: 'São Paulo',
        },
    });
    // 2. Criar Escolas
    const school1 = await prisma.school.create({
        data: {
            departmentId: department.id,
            name: 'Escola Municipal Santos Dumont',
            code: 'EM-SD-01',
            city: 'São Paulo',
            state: 'SP',
            type: 'MUNICIPAL',
        },
    });
    const school2 = await prisma.school.create({
        data: {
            name: 'Colégio Estadual Tiradentes',
            code: 'CE-TIR-02',
            city: 'Rio de Janeiro',
            state: 'RJ',
            type: 'ESTADUAL',
        },
    });
    // Senhas com hash Bcrypt seguro
    const studentPasswordHash = await bcrypt.hash('aluno123', 10);
    const teacherPasswordHash = await bcrypt.hash('prof123', 10);
    const coordPasswordHash = await bcrypt.hash('coord123', 10);
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    // 3. Usuários da Escola 1 (Santos Dumont)
    const admin1 = await prisma.user.create({
        data: {
            schoolId: school1.id,
            registrationNumber: 'ADMIN01',
            name: 'Roberto Andrade (Diretor)',
            email: 'roberto.diretor@escola.gov.br',
            passwordHash: adminPasswordHash,
            role: 'ADMIN',
            avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
        },
    });
    const coord1 = await prisma.user.create({
        data: {
            schoolId: school1.id,
            registrationNumber: 'COORD01',
            name: 'Juliana Prado (Coordenação)',
            email: 'juliana.prado@escola.gov.br',
            passwordHash: coordPasswordHash,
            role: 'COORDINATOR',
            avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        },
    });
    const teacherMath = await prisma.user.create({
        data: {
            schoolId: school1.id,
            registrationNumber: 'PROF01',
            name: 'Prof. Carlos Eduardo (Matemática)',
            email: 'carlos.eduardo@escola.gov.br',
            passwordHash: teacherPasswordHash,
            role: 'TEACHER',
            avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        },
    });
    const teacherPort = await prisma.user.create({
        data: {
            schoolId: school1.id,
            registrationNumber: 'PROF02',
            name: 'Profª. Mariana Costa (Português)',
            email: 'mariana.costa@escola.gov.br',
            passwordHash: teacherPasswordHash,
            role: 'TEACHER',
            avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
        },
    });
    const studentLucas = await prisma.user.create({
        data: {
            schoolId: school1.id,
            registrationNumber: 'RA202601',
            name: 'Lucas Silva',
            email: 'lucas.silva@estudante.escola.gov.br',
            passwordHash: studentPasswordHash,
            role: 'STUDENT',
            avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
        },
    });
    const studentBeatriz = await prisma.user.create({
        data: {
            schoolId: school1.id,
            registrationNumber: 'RA202602',
            name: 'Beatriz Oliveira',
            email: 'beatriz.oliveira@estudante.escola.gov.br',
            passwordHash: studentPasswordHash,
            role: 'STUDENT',
            avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
        },
    });
    const studentGabriel = await prisma.user.create({
        data: {
            schoolId: school1.id,
            registrationNumber: 'RA202603',
            name: 'Gabriel Santos',
            email: 'gabriel.santos@estudante.escola.gov.br',
            passwordHash: studentPasswordHash,
            role: 'STUDENT',
            avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        },
    });
    // Usuário de teste da Escola 2 (para testes de isolamento de tenant)
    await prisma.user.create({
        data: {
            schoolId: school2.id,
            registrationNumber: 'RA999999',
            name: 'Aluno Outra Escola',
            passwordHash: studentPasswordHash,
            role: 'STUDENT',
        },
    });
    // 4. Criar Turmas
    const class8A = await prisma.class.create({
        data: {
            schoolId: school1.id,
            name: '8º Ano A',
            grade: '8º Ano - Ensino Fundamental',
            shift: 'MANHA',
            year: 2026,
            code: '8ANO-A',
            channels: {
                create: [
                    { name: 'geral', type: 'TEXT' },
                    { name: 'avisos', type: 'ANNOUNCEMENT', isLocked: true },
                    { name: 'matemática', type: 'TEXT' },
                    { name: 'português', type: 'TEXT' },
                    { name: 'ciências', type: 'TEXT' },
                ],
            },
        },
        include: { channels: true },
    });
    const class7B = await prisma.class.create({
        data: {
            schoolId: school1.id,
            name: '7º Ano B',
            grade: '7º Ano - Ensino Fundamental',
            shift: 'TARDE',
            year: 2026,
            code: '7ANO-B',
            channels: {
                create: [
                    { name: 'geral', type: 'TEXT' },
                    { name: 'avisos', type: 'ANNOUNCEMENT', isLocked: true },
                    { name: 'matemática', type: 'TEXT' },
                ],
            },
        },
    });
    const class6A = await prisma.class.create({
        data: {
            schoolId: school1.id,
            name: '6º Ano A',
            grade: '6º Ano - Ensino Fundamental',
            shift: 'MANHA',
            year: 2026,
            code: '6ANO-A',
            channels: {
                create: [
                    { name: 'geral', type: 'TEXT' },
                    { name: 'avisos', type: 'ANNOUNCEMENT', isLocked: true },
                ],
            },
        },
    });
    // 5. Matricular Professores e Alunos no 8º Ano A
    await prisma.enrollment.createMany({
        data: [
            { userId: teacherMath.id, classId: class8A.id, role: 'TEACHER', subject: 'Matemática' },
            { userId: teacherPort.id, classId: class8A.id, role: 'TEACHER', subject: 'Português' },
            { userId: studentLucas.id, classId: class8A.id, role: 'STUDENT' },
            { userId: studentBeatriz.id, classId: class8A.id, role: 'STUDENT' },
            { userId: studentGabriel.id, classId: class8A.id, role: 'STUDENT' },
            // Também matricular Lucas e Prof. Carlos no 7º Ano B
            { userId: teacherMath.id, classId: class7B.id, role: 'TEACHER', subject: 'Matemática' },
            { userId: studentLucas.id, classId: class7B.id, role: 'STUDENT' },
        ],
    });
    // 6. Mensagens Iniciais nos Canais
    const generalChannel = class8A.channels.find((c) => c.name === 'geral');
    const avisosChannel = class8A.channels.find((c) => c.name === 'avisos');
    const mathChannel = class8A.channels.find((c) => c.name === 'matemática');
    if (generalChannel) {
        await prisma.message.createMany({
            data: [
                {
                    channelId: generalChannel.id,
                    senderId: teacherMath.id,
                    content: 'Olá a todos! Sejam muito bem-vindos ao ambiente virtual da nossa turma 8º Ano A!',
                },
                {
                    channelId: generalChannel.id,
                    senderId: studentLucas.id,
                    content: 'Bom dia professor! Ansioso pelas aulas na Sala do Futuro.',
                },
                {
                    channelId: generalChannel.id,
                    senderId: studentBeatriz.id,
                    content: 'Bom dia! O sistema está funcionando super rápido!',
                },
            ],
        });
    }
    if (avisosChannel) {
        await prisma.message.create({
            data: {
                channelId: avisosChannel.id,
                senderId: coord1.id,
                content: '📢 AVISO OFICIAL: A nossa próxima aula ao vivo de Matemática acontecerá hoje às 14:00 na Sala do Futuro. Tenham seus cadernos e materiais em mãos!',
                isPinned: true,
            },
        });
    }
    if (mathChannel) {
        await prisma.message.create({
            data: {
                channelId: mathChannel.id,
                senderId: teacherMath.id,
                content: 'Aqui iremos debater as dúvidas sobre Equações de Primeiro Grau e Geometria Plana.',
            },
        });
    }
    // 7. Atividades e Materiais Didáticos
    await prisma.assignment.create({
        data: {
            classId: class8A.id,
            teacherId: teacherMath.id,
            title: 'Lista de Exercícios — Equações do 1º Grau',
            subject: 'Matemática',
            description: 'Resolva os exercícios da página 45 a 48 do livro digital e anexe a resolução em formato PDF ou imagem.',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Em 7 dias
            maxScore: 10.0,
        },
    });
    await prisma.assignment.create({
        data: {
            classId: class8A.id,
            teacherId: teacherPort.id,
            title: 'Redação: A Tecnologia na Educação Pública',
            subject: 'Português',
            description: 'Escreva um texto dissertativo-argumentativo de 20 a 30 linhas sobre os impactos da tecnologia no aprendizado.',
            dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
            maxScore: 10.0,
        },
    });
    await prisma.material.create({
        data: {
            classId: class8A.id,
            uploaderId: teacherMath.id,
            title: 'Guia de Fórmulas e Teoremas Matemáticos 2026.pdf',
            description: 'Material complementar com resumo ilustrado das fórmulas de geometria.',
            fileUrl: 'https://example.com/materiais/guia-matematica.pdf',
            fileType: 'PDF',
            fileSize: '3.4 MB',
        },
    });
    // 8. Trilha de Auditoria Inicial
    await prisma.auditLog.create({
        data: {
            schoolId: school1.id,
            userId: admin1.id,
            action: 'SYSTEM_INITIALIZATION',
            resource: 'SYSTEM',
            ipAddress: '127.0.0.1',
            details: JSON.stringify({ event: 'Ambiente escolar e turmas configuradas com sucesso' }),
        },
    });
    console.log('✅ Seed finalizado com sucesso!');
    console.log('--- Credenciais de Acesso Rápido ---');
    console.log('Aluno:      RA: RA202601   | Senha: aluno123');
    console.log('Professor:  RA: PROF01     | Senha: prof123');
    console.log('Coordenação:RA: COORD01    | Senha: coord123');
    console.log('Direção:    RA: ADMIN01    | Senha: admin123');
}
main()
    .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
