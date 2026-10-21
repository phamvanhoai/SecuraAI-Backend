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
  verifyPasswordResetCode,
} from './auth.controller.js';
import { googleLoginBodySchema, loginBodySchema, refreshBodySchema } from './dto/auth.dto.js';
import {
  changePasswordBodySchema,
  confirmPasswordResetBodySchema,
  requestPasswordResetBodySchema,
  verifyPasswordResetBodySchema,
} from './dto/password.dto.js';

export const authRouter = Router();
const rateLimitMessage = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
} as const;
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: rateLimitMessage,
});
const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: rateLimitMessage,
});
const passwordWorkflowLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: rateLimitMessage,
});

authRouter.post('/login', credentialLimiter, validate({ body: loginBodySchema }), asyncHandler(login));
authRouter.post(
  '/google',
  credentialLimiter,
  validate({ body: googleLoginBodySchema }),
  asyncHandler(loginWithGoogle),
);
authRouter.post(
  '/refresh',
  sessionLimiter,
  validate({ body: refreshBodySchema }),
  asyncHandler(refresh),
);
authRouter.post('/logout', validate({ body: refreshBodySchema }), asyncHandler(logout));
authRouter.post(
  '/password-reset/request',
  passwordWorkflowLimiter,
  validate({ body: requestPasswordResetBodySchema }),
  asyncHandler(requestPasswordReset),
);
authRouter.post(
  '/password-reset/verify',
  passwordWorkflowLimiter,
  validate({ body: verifyPasswordResetBodySchema }),
  asyncHandler(verifyPasswordResetCode),
);
authRouter.post(
  '/password-reset/confirm',
  passwordWorkflowLimiter,
  validate({ body: confirmPasswordResetBodySchema }),
  asyncHandler(confirmPasswordReset),
);
authRouter.post(
  '/change-password',
  passwordWorkflowLimiter,
  authenticate,
  validate({ body: changePasswordBodySchema }),
  asyncHandler(changePassword),
);
