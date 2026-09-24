import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler } from '../../common/utils/async-handler.js';

export const healthRouter = Router();
healthRouter.get('/live', (_req, res) =>
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } }),
);
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      data: { status: 'ready', database: 'up', timestamp: new Date().toISOString() },
    });
  }),
);
