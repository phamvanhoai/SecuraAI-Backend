import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { validate } from '../../common/middleware/validate.js';
import { createUserBodySchema } from './dto/create-user.dto.js';
import { listUsersQuerySchema } from './dto/list-users-query.dto.js';
import { createUser, getCurrentUser, listDepartments, listUsers } from './users.controller.js';
import { getUser, updateUser } from './users.controller.js';
import { userParamsSchema } from './dto/user-params.dto.js';
import { updateUserBodySchema } from './dto/update-user.dto.js';
import { assignUserAccessBodySchema } from './dto/assign-user-access.dto.js';
import {
  assignUserAccess,
  getUserAccessAssignment,
  getUserAccessAssignmentOptions,
} from './users.controller.js';

export const usersRouter = Router();
usersRouter.get(
  '/',
  authenticate,
  validate({ query: listUsersQuerySchema }),
  asyncHandler(listUsers),
);
usersRouter.post(
  '/',
  authenticate,
  validate({ body: createUserBodySchema }),
  asyncHandler(createUser),
);
usersRouter.get('/me', authenticate, asyncHandler(getCurrentUser));
usersRouter.get('/create-options', authenticate, asyncHandler(listDepartments));
usersRouter.get(
  '/access-assignment-options',
  authenticate,
  asyncHandler(getUserAccessAssignmentOptions),
);
usersRouter.get(
  '/:userId/access-assignment',
  authenticate,
  validate({ params: userParamsSchema }),
  asyncHandler(getUserAccessAssignment),
);
usersRouter.put(
  '/:userId/access-assignment',
  authenticate,
  validate({ params: userParamsSchema, body: assignUserAccessBodySchema }),
  asyncHandler(assignUserAccess),
);
usersRouter.get(
  '/:userId',
  authenticate,
  validate({ params: userParamsSchema }),
  asyncHandler(getUser),
);
usersRouter.patch(
  '/:userId',
  authenticate,
  validate({ params: userParamsSchema, body: updateUserBodySchema }),
  asyncHandler(updateUser),
);
