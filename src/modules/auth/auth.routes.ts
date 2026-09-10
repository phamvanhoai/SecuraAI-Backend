import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { validate } from '../../common/middleware/validate.js';
import { loginSchema, refreshSchema } from './auth.schema.js';
import {
  confirmPasswordResetBodySchema,
  requestPasswordResetBodySchema,
} from './dto/password-reset.dto.js';
import { changePasswordBodySchema } from './dto/change-password.dto.js';
import * as controller from './auth.controller.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { setupMfaBodySchema, verifyMfaBodySchema } from './dto/mfa.dto.js';

export const authRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts' } },
});

authRouter.post(
  '/password-reset/request',
  authLimiter,
  validate({ body: requestPasswordResetBodySchema }),
  asyncHandler(controller.requestPasswordReset),
);
authRouter.post(
  '/password-reset/confirm',
  authLimiter,
  validate({ body: confirmPasswordResetBodySchema }),
  asyncHandler(controller.confirmPasswordReset),
);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordBodySchema }),
  asyncHandler(controller.changePassword),
);
authRouter.post(
  '/mfa/setup',
  authenticate,
  validate({ body: setupMfaBodySchema }),
  asyncHandler(controller.setupMfa),
);
authRouter.post(
  '/mfa/verify',
  authenticate,
  authLimiter,
  validate({ body: verifyMfaBodySchema }),
  asyncHandler(controller.verifyMfa),
);
authRouter.post('/refresh', authLimiter, validate({ body: refreshSchema }), asyncHandler(controller.refresh));
authRouter.post('/logout', validate({ body: refreshSchema }), asyncHandler(controller.logout));
