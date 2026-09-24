import { Router } from 'express';
import { authRouter } from '../modules/authentication-account/auth.routes.js';
import {
  mfaRecoveryAdminRouter,
  mfaRecoveryPublicRouter,
} from '../modules/authentication-account/mfa-recovery.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { usersRouter } from '../modules/user-management-authorization/users.routes.js';
import { businessModules } from '../modules/index.js';

import { loginHistoryRouter } from '../modules/audit-security-reporting/audit-settings.routes.js';

export const apiRouter = Router();
apiRouter.use('/login-history', loginHistoryRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/auth/mfa/recovery-requests', mfaRecoveryPublicRouter);
apiRouter.use('/admin/mfa-recovery-requests', mfaRecoveryAdminRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/admin/users', usersRouter);
for (const module of businessModules) apiRouter.use(module.routePrefix, module.router);
