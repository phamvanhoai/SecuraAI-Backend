import { createServer } from 'node:http';
import { createApp } from '@/app.js';
import { env } from '@/config/env.js';
import { logger } from '@/config/logger.js';
import { prisma } from '@/database/prisma.js';

const server = createServer(createApp());

const startServer = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info({ database: 'postgresql' }, 'Database connection established');

    server.listen(env.PORT, () =>
      logger.info(
        {
          port: env.PORT,
          docs: env.SWAGGER_ENABLED ? `http://localhost:${env.PORT}/docs` : 'disabled',
        },
        'SecuraAI API started',
      ),
    );
  } catch (error: unknown) {
    logger.fatal(
      { errorType: error instanceof Error ? error.name : 'UnknownError' },
      'Database connection failed',
    );
    await prisma.$disconnect();
    process.exit(1);
  }
};

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'Graceful shutdown started');
  server.close(async (error) => {
    await prisma.$disconnect();
    if (error) { logger.error({ err: error }, 'HTTP server shutdown failed'); process.exit(1); }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (error) => { logger.fatal({ err: error }, 'Uncaught exception'); void shutdown('uncaughtException'); });
process.on('unhandledRejection', (reason) => { logger.fatal({ err: reason }, 'Unhandled rejection'); void shutdown('unhandledRejection'); });

void startServer();
