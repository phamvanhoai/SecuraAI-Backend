import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { login, logout, refresh } from './auth.controller.js';
import { loginBodySchema, refreshBodySchema } from './dto/auth.dto.js';

export const authRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts' } },
});

authRouter.post('/login', authLimiter, validate({ body: loginBodySchema }), asyncHandler(login));
authRouter.post('/refresh', authLimiter, validate({ body: refreshBodySchema }), asyncHandler(refresh));
authRouter.post('/logout', validate({ body: refreshBodySchema }), asyncHandler(logout));
