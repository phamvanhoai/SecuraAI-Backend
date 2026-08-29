import { Router } from 'express';
import { authenticate } from '@/common/middleware/authenticate.js';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { me } from './users.controller.js';

export const usersRouter = Router();
usersRouter.get('/me', authenticate, asyncHandler(me));
