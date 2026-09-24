import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { auditSettingsService } from './audit-settings.service.js';
import { listLoginHistoryQuerySchema } from './dto/index.js';

export const listLoginHistory: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await auditSettingsService.listLoginHistory(
    listLoginHistoryQuerySchema.parse(req.query),
    req.auth,
  );
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data });
};
