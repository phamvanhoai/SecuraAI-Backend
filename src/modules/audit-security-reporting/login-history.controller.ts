import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { listLoginHistoryQuerySchema } from './dto/list-login-history.dto.js';
import { loginHistoryService } from './login-history.service.js';

export async function listLoginHistory(req: Request, res: Response): Promise<void> {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  const data = await loginHistoryService.list(userId, listLoginHistoryQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
}
