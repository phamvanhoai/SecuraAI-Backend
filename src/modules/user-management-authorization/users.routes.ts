import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { validate } from '../../common/middleware/validate.js';
import { createUserBodySchema } from './dto/create-user.dto.js';
import { listUsersQuerySchema } from './dto/list-users-query.dto.js';
import { createUser, getCurrentUser, listUsers } from './users.controller.js';

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
