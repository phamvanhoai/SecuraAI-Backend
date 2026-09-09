import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { validate } from '../../common/middleware/validate.js';
import { loginSchema, refreshSchema } from './auth.schema.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts' } },
});

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));
authRouter.post('/refresh', authLimiter, validate({ body: refreshSchema }), asyncHandler(controller.refresh));
authRouter.post('/logout', validate({ body: refreshSchema }), asyncHandler(controller.logout));
