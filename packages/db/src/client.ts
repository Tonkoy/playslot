import { PrismaClient } from '@prisma/client';

/**
 * A single PrismaClient per process. In dev, Next.js / Nest watch-mode can
 * re-evaluate modules repeatedly; caching on globalThis avoids exhausting the
 * connection pool with a new client on every reload.
 */
const globalForPrisma = globalThis as unknown as { __playslotPrisma?: PrismaClient };

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.__playslotPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__playslotPrisma = prisma;
}
