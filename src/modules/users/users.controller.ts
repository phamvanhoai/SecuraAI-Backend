import type { RequestHandler } from 'express';
import { AppError } from '@/common/errors/app-error.js';
import { usersService } from './users.service.js';

export const me: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({ success: true, data: await usersService.findMe(req.auth.userId) });
};
