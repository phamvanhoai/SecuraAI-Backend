import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { usersService } from './users.service.js';
import type { CreateUserBody } from './dto/create-user.dto.js';
import { listUsersQuerySchema } from './dto/list-users-query.dto.js';
import type { UserParams } from './dto/user-params.dto.js';
import type { UpdateUserBody } from './dto/update-user.dto.js';
import type { AssignUserAccessBody } from './dto/assign-user-access.dto.js';

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

export const listDepartments: RequestHandler = async (_req, res) => {
  const data = await usersService.listDepartments(
    authenticatedUserId(res.locals.authenticatedUserId),
  );
  res.status(200).json({ success: true, data });
};

export const getUser: RequestHandler = async (req, res) => {
  const { userId } = req.params as UserParams;
  const data = await usersService.getUser(
    authenticatedUserId(res.locals.authenticatedUserId),
    userId,
  );
  res.status(200).json({ success: true, data });
};

export const updateUser: RequestHandler = async (req, res) => {
  const { userId } = req.params as UserParams;
  const data = await usersService.updateUser(
    authenticatedUserId(res.locals.authenticatedUserId),
    userId,
    req.body as UpdateUserBody,
  );
  res.status(200).json({ success: true, data });
};

export const getUserAccessAssignment: RequestHandler = async (req, res) => {
  const { userId } = req.params as UserParams;
  const data = await usersService.getUserAccessAssignment(
    authenticatedUserId(res.locals.authenticatedUserId),
    userId,
  );
  res.status(200).json({ success: true, data });
};

export const getUserAccessAssignmentOptions: RequestHandler = async (_req, res) => {
  const data = await usersService.getUserAccessAssignmentOptions(
    authenticatedUserId(res.locals.authenticatedUserId),
  );
  res.status(200).json({ success: true, data });
};

export const assignUserAccess: RequestHandler = async (req, res) => {
  const { userId } = req.params as UserParams;
  const data = await usersService.assignUserAccess(
    authenticatedUserId(res.locals.authenticatedUserId),
    userId,
    req.body as AssignUserAccessBody,
  );
  res.status(200).json({ success: true, data });
};
