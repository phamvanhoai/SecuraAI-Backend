import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizeRoles } from '../../common/middleware/authorize-roles.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { getSecurityDashboard } from './security-dashboard.controller.js';

export const securityDashboardRouter = Router();

securityDashboardRouter.use(
  authenticate,
  authorizeRoles('SECURITY_OFFICER', 'EXECUTIVE'),
);

securityDashboardRouter.get('/', asyncHandler(getSecurityDashboard));
securityDashboardRouter.get('/security-posture', asyncHandler(getSecurityDashboard));
