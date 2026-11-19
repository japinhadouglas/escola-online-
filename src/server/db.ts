import { PrismaClient } from '@prisma/client';

let pragmaDone = false;

// PRAGMAs só fazem sentido no SQLite. No PostgreSQL, são ignoradas.
async function applySqlitePragmas(db: PrismaClient) {
  if (pragmaDone) return;
  if (!process.env.DATABASE_URL?.startsWith('file:')) {
    pragmaDone = true;
    console.log('[DB] PostgreSQL detectado — pragmas SQLite ignorados');
    return;
  }
  try {
    await db.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
    await db.$queryRawUnsafe('PRAGMA synchronous = NORMAL');
    await db.$queryRawUnsafe('PRAGMA foreign_keys = ON');
    await db.$queryRawUnsafe('PRAGMA cache_size = -64000');
    pragmaDone = true;
    console.log('[DB] SQLite WAL mode ativado com sucesso');
  } catch (err: any) {
    console.log('[DB] Aviso: nao foi possivel ativar WAL mode:', err.message);
  }
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

applySqlitePragmas(prisma);

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLast = i === retries - 1;
      const isBusy = err?.code === 'P1001' || err?.code === 'P1002' || err?.code === 'P1008';
      if (isBusy && !isLast) {
        console.log(`[DB] Tentativa ${i + 1}/${retries} - banco indisponivel, retry em ${500 * (i + 1)}ms...`);
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}