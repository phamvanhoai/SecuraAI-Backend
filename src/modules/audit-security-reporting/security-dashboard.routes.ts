import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { getSecurityDashboard } from './security-dashboard.controller.js';

export const securityDashboardRouter = Router();

securityDashboardRouter.get('/', authenticate, asyncHandler(getSecurityDashboard));
securityDashboardRouter.get('/security-posture', authenticate, asyncHandler(getSecurityDashboard));
