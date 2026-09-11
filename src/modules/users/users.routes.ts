import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { validate } from '../../common/middleware/validate.js';
import { initializeAccount, me } from './users.controller.js';
import { createUserBodySchema } from './dto/create-user.dto.js';

export const usersRouter = Router();
usersRouter.post(
	'/',
	authenticate,
	authorize('users.create'),
	validate({ body: createUserBodySchema }),
	asyncHandler(initializeAccount),
);
usersRouter.get('/me', authenticate, asyncHandler(me));
