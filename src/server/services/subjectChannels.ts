import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';

/**
 * Normaliza um nome de matéria para o slug do canal (minúsculas, sem acentos).
 * Ex.: "Língua Portuguesa" -> "lingua-portuguesa"
 */
export function subjectToChannelSlug(subject: string): string {
  return subject
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

/**
 * Sincroniza os canais de matéria de uma turma a partir das matrículas de
 * professores que possuem matéria definida (enrollment.subject).
 *
 * Para cada matéria de professor, garante a existência de um canal de texto
 * com o nome da matéria (ex.: "matemática", "lingua-portuguesa").
 *
 * Matérias especiais (ex.: "Geral") são ignoradas para não duplicar o canal "geral".
 *
 * @param classId id da turma
 * @param prismaClient instância opcional do Prisma (evita criar outra conexão)
 */
export async function syncSubjectChannelsForClass(
  classId: string,
  prismaClient: PrismaClient = defaultPrisma,
): Promise<number> {
  const teachers = await prismaClient.enrollment.findMany({
    where: { classId, role: 'TEACHER' },
    select: { subject: true },
  });

  const subjects = Array.from(
    new Set(
      teachers
        .map((t) => t.subject?.trim())
        .filter((s): s is string => !!s && s.toLowerCase() !== 'geral'),
    ),
  );

  const existing = await prismaClient.channel.findMany({
    where: { classId, type: 'TEXT' },
    select: { name: true },
  });
  const existingLower = new Set(existing.map((c) => c.name.toLowerCase().trim()));

  let created = 0;
  for (const subject of subjects) {
    if (existingLower.has(subject.toLowerCase().trim())) continue;
    await prismaClient.channel.create({
      data: { classId, name: subject, type: 'TEXT' },
    });
    created++;
  }

  return created;
}
