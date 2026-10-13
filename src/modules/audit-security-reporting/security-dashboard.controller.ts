import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { securityDashboardService } from './security-dashboard.service.js';

export const getSecurityDashboard: RequestHandler = async (_req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const data = await securityDashboardService.getDashboard(userId);
  res.status(200).json({
    success: true,
    data,
  });
};
