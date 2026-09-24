import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { usersService } from './users.service.js';
import { createUserBodySchema } from './dto/create-user.dto.js';
import { listUsersQuerySchema } from './dto/list-users-query.dto.js';
import { accountLockBodySchema, accountLockParamsSchema } from './dto/account-lock.dto.js';
import { accountLockService } from './account-lock.service.js';
import { getUserParamsSchema } from './dto/get-user.dto.js';
import { accountDeactivationService } from './account-deactivation.service.js';
import { deactivateUserBodySchema, deactivateUserParamsSchema } from './dto/deactivate-user.dto.js';
import { updateUserBodySchema } from './dto/update-user.dto.js';
import { assignUserRolesBodySchema } from './dto/assign-user-roles.dto.js';
import { userRoleService } from './user-role.service.js';

const changeAccountLock =
  (action: 'lock' | 'unlock'): RequestHandler =>
  async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const { userId } = accountLockParamsSchema.parse(req.params);
    const data = await accountLockService.change(
      userId,
      action,
      accountLockBodySchema.parse(req.body),
      req.auth,
      {
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
      },
    );
    res.status(200).json({ success: true, data });
  };
export const lockAccount: RequestHandler = changeAccountLock('lock');
export const unlockAccount: RequestHandler = changeAccountLock('unlock');

const changeAccountAvailability =
  (action: 'deactivate' | 'remove'): RequestHandler =>
  async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const { userId } = deactivateUserParamsSchema.parse(req.params);
    const data = await accountDeactivationService.change(
      userId,
      action,
      deactivateUserBodySchema.parse(req.body),
      req.auth,
      { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
    );
    res.status(200).json({ success: true, data });
  };
export const deactivateAccount: RequestHandler = changeAccountAvailability('deactivate');
export const removeAccount: RequestHandler = changeAccountAvailability('remove');

export const initializeAccount: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await usersService.initializeAccount(createUserBodySchema.parse(req.body), req.auth);
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

export const listUserCreateOptions: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await usersService.listCreateOptions(req.auth);
  res.status(200).json({ success: true, data });
};

export const getUser: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { userId } = getUserParamsSchema.parse(req.params);
  const data = await usersService.getById(userId);
  res.status(200).json({ success: true, data });
};

export const updateUser: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { userId } = getUserParamsSchema.parse(req.params);
  const data = await usersService.update(userId, updateUserBodySchema.parse(req.body), req.auth);
  res.status(200).json({ success: true, data });
};

export const listAssignableRoles: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.status(200).json({ success: true, data: await userRoleService.listAssignable(req.auth) });
};

export const assignUserRoles: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { userId } = getUserParamsSchema.parse(req.params);
  const data = await userRoleService.assign(userId, assignUserRolesBodySchema.parse(req.body), req.auth);
  res.status(200).json({ success: true, data });
};

export const me: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({ success: true, data: await usersService.findMe(req.auth.userId) });
};
