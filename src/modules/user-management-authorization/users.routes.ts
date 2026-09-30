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
import { AppError } from '../../common/errors/app-error.js';

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
for (const pendingPath of ['/assignable-roles']) {
  usersRouter.get(pendingPath, (_req, _res, next) => {
    next(
      new AppError(
        501,
        'ENDPOINT_NOT_IMPLEMENTED',
        'This endpoint is pending migration to the V2 database',
      ),
    );
  });
}
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
