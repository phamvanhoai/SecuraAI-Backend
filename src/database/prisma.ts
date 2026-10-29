import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const databaseUrl = new URL(env.DATABASE_URL);
if (env.NODE_ENV === 'development' && !databaseUrl.searchParams.has('connection_limit')) {
  databaseUrl.searchParams.set('connection_limit', '5');
}
if (env.NODE_ENV === 'development' && !databaseUrl.searchParams.has('pool_timeout')) {
  databaseUrl.searchParams.set('pool_timeout', '30');
}
if (env.NODE_ENV === 'development' && !databaseUrl.searchParams.has('connect_timeout')) {
  databaseUrl.searchParams.set('connect_timeout', '30');
}

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl.toString() } },
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
