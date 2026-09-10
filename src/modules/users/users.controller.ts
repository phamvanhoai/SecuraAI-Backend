import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { usersService } from './users.service.js';
import { createUserBodySchema } from './dto/create-user.dto.js';
import { listUsersQuerySchema } from './dto/list-users-query.dto.js';

export const initializeAccount: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await usersService.initializeAccount(
    createUserBodySchema.parse(req.body),
    req.auth.userId,
  );
  res.status(201).json({ success: true, data });
};

export const listUsers: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (!req.auth.permissions.includes('users.read')) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  const data = await usersService.list(listUsersQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};

export const me: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({ success: true, data: await usersService.findMe(req.auth.userId) });
};
