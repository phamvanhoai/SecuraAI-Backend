import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { listUserActivityAuditQuerySchema } from './dto/list-user-activity-audit.dto.js';
import { userActivityAuditService } from './user-activity-audit.service.js';

export const listUserActivityAudit: RequestHandler = async (req, res) => {
  const actorUserId: unknown = res.locals.authenticatedUserId;
  if (typeof actorUserId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await userActivityAuditService.list(
    actorUserId,
    listUserActivityAuditQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
