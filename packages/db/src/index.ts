// Re-export the generated Prisma client + all model types and enums so consumers
// import them from '@playslot/db' rather than reaching into @prisma/client.
export * from '@prisma/client';
export { prisma, createPrismaClient } from './client';
