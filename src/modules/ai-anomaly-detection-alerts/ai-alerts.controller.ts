import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { listAiAlertsQuerySchema } from './dto/list-ai-alerts.dto.js';
import { aiAlertsService } from './ai-alerts.service.js';

export const listAiAlerts: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await aiAlertsService.list(userId, listAiAlertsQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};
