import { Router, type RequestHandler } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { AppError } from '../../common/errors/app-error.js';
import { listLoginHistory } from './audit-settings.controller.js';
import { listLoginHistoryQuerySchema } from './dto/index.js';

const requireHistoryRole: RequestHandler = (req, _res, next) => {
  if (!req.auth?.roles.some((role) => role === 'ADMIN' || role === 'SECURITY_OFFICER'))
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  next();
};
export const loginHistoryRouter = Router();
loginHistoryRouter.get(
  '/',
  authenticate,
  requireHistoryRole,
  authorize('login-history.read'),
  validate({ query: listLoginHistoryQuerySchema }),
  asyncHandler(listLoginHistory),
);
export const auditSettingsRouter = Router();
auditSettingsRouter.use('/login-history', loginHistoryRouter);
