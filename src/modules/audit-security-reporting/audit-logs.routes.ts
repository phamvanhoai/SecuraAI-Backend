import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { getAuditLogParamsSchema, listAuditLogsQuerySchema } from './dto/list-audit-logs.dto.js';
import { getAuditLogDetail, getAuditLogDiff, listAuditLogs } from './audit-logs.controller.js';

export const auditLogsRouter = Router();

auditLogsRouter.get(
  '/',
  authenticate,
  validate({ query: listAuditLogsQuerySchema }),
  asyncHandler(listAuditLogs),
);

auditLogsRouter.get(
  '/:id',
  authenticate,
  validate({ params: getAuditLogParamsSchema }),
  asyncHandler(getAuditLogDetail),
);

auditLogsRouter.get(
  '/:id/diff',
  authenticate,
  validate({ params: getAuditLogParamsSchema }),
  asyncHandler(getAuditLogDiff),
);

