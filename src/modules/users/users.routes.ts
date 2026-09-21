import { Router } from 'express';
import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { validate } from '../../common/middleware/validate.js';
import {
  getUser,
  initializeAccount,
  listUserCreateOptions,
  listUsers,
  me,
  lockAccount,
  unlockAccount,
  updateUser,
} from './users.controller.js';
import { accountLockBodySchema, accountLockParamsSchema } from './dto/account-lock.dto.js';
import { createUserBodySchema } from './dto/create-user.dto.js';
import { getUserParamsSchema } from './dto/get-user.dto.js';
import { updateUserBodySchema } from './dto/update-user.dto.js';

export const usersRouter = Router();
const requireAccountAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth?.roles.includes('ADMIN'))
    throw new AppError(
      403,
      'ADMIN_REQUIRED',
      'Only administrators can lock or unlock user accounts',
    );
  next();
};
usersRouter.get('/', authenticate, authorize('users.read'), asyncHandler(listUsers));
usersRouter.post(
  '/',
  authenticate,
  authorize('users.create'),
  validate({ body: createUserBodySchema }),
  asyncHandler(initializeAccount),
);
usersRouter.get('/me', authenticate, asyncHandler(me));
usersRouter.get(
  '/create-options',
  authenticate,
  authorize('users.create'),
  asyncHandler(listUserCreateOptions),
);
usersRouter.patch(
  '/:userId',
  authenticate,
  authorize('users.update'),
  validate({ params: getUserParamsSchema, body: updateUserBodySchema }),
  asyncHandler(updateUser),
);
usersRouter.get(
  '/:userId',
  authenticate,
  authorize('users.read'),
  validate({ params: getUserParamsSchema }),
  asyncHandler(getUser),
);
usersRouter.post(
  '/:userId/lock',
  authenticate,
  requireAccountAdmin,
  authorize('users.lock'),
  validate({ params: accountLockParamsSchema, body: accountLockBodySchema }),
  asyncHandler(lockAccount),
);
usersRouter.post(
  '/:userId/unlock',
  authenticate,
  requireAccountAdmin,
  authorize('users.unlock'),
  validate({ params: accountLockParamsSchema, body: accountLockBodySchema }),
  asyncHandler(unlockAccount),
);
