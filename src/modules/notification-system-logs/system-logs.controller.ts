import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { searchSystemLogsQuerySchema } from './dto/search-system-logs.dto.js';
import { systemLogsService } from './system-logs.service.js';

export const searchSystemLogs: RequestHandler = async (req, res) => {
  const actorUserId: unknown = res.locals.authenticatedUserId;
  if (typeof actorUserId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await systemLogsService.search(actorUserId, searchSystemLogsQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};
