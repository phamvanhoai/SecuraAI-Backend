import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizePermission } from '../../common/middleware/authorize-permission.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { listUserActivityAuditQuerySchema } from './dto/list-user-activity-audit.dto.js';
import { listUserActivityAudit } from './user-activity-audit.controller.js';

export const auditRouter = Router();
auditRouter.get(
  '/user-activities',
  authenticate,
  authorizePermission('audit.read'),
  validate({ query: listUserActivityAuditQuerySchema }),
  asyncHandler(listUserActivityAudit),
);
