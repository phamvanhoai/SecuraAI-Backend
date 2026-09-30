import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { usersService } from './users.service.js';
import type { CreateUserBody } from './dto/create-user.dto.js';
import { listUsersQuerySchema } from './dto/list-users-query.dto.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}

export const createUser: RequestHandler = async (req, res) => {
  const data = await usersService.createUser(
    authenticatedUserId(res.locals.authenticatedUserId),
    req.body as CreateUserBody,
  );
  res.status(201).json({ success: true, data });
};

export const listUsers: RequestHandler = async (req, res) => {
  const data = await usersService.listUsers(
    authenticatedUserId(res.locals.authenticatedUserId),
    listUsersQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const getCurrentUser: RequestHandler = async (_req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const data = await usersService.getCurrentUser(userId);
  res.status(200).json({ success: true, data });
};
