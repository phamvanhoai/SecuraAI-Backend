import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../common/middleware/validate.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  changePassword,
  confirmPasswordReset,
  login,
  loginWithGoogle,
  logout,
  refresh,
  requestPasswordReset,
} from './auth.controller.js';
import { googleLoginBodySchema, loginBodySchema, refreshBodySchema } from './dto/auth.dto.js';
import {
  changePasswordBodySchema,
  confirmPasswordResetBodySchema,
  requestPasswordResetBodySchema,
} from './dto/password.dto.js';

export const authRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts' } },
});

authRouter.post('/login', authLimiter, validate({ body: loginBodySchema }), asyncHandler(login));
authRouter.post(
  '/google',
  authLimiter,
  validate({ body: googleLoginBodySchema }),
  asyncHandler(loginWithGoogle),
);
authRouter.post(
  '/refresh',
  authLimiter,
  validate({ body: refreshBodySchema }),
  asyncHandler(refresh),
);
authRouter.post('/logout', validate({ body: refreshBodySchema }), asyncHandler(logout));
authRouter.post(
  '/password-reset/request',
  authLimiter,
  validate({ body: requestPasswordResetBodySchema }),
  asyncHandler(requestPasswordReset),
);
authRouter.post(
  '/password-reset/confirm',
  authLimiter,
  validate({ body: confirmPasswordResetBodySchema }),
  asyncHandler(confirmPasswordReset),
);
authRouter.post(
  '/change-password',
  authLimiter,
  authenticate,
  validate({ body: changePasswordBodySchema }),
  asyncHandler(changePassword),
);
