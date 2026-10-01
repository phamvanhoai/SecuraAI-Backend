import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const databaseUrl = new URL(env.DATABASE_URL);
if (env.NODE_ENV === 'development' && !databaseUrl.searchParams.has('connection_limit')) {
  databaseUrl.searchParams.set('connection_limit', '5');
}
if (env.NODE_ENV === 'development' && !databaseUrl.searchParams.has('pool_timeout')) {
  databaseUrl.searchParams.set('pool_timeout', '10');
}

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl.toString() } },
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
