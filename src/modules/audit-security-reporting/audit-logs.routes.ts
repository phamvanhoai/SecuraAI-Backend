import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizeRoles } from '../../common/middleware/authorize-roles.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { getAuditLogParamsSchema, listAuditLogsQuerySchema } from './dto/list-audit-logs.dto.js';
import { getAuditLogDetail, getAuditLogDiff, listAuditLogs } from './audit-logs.controller.js';

export const auditLogsRouter = Router();

auditLogsRouter.use(authenticate, authorizeRoles('ADMIN', 'SECURITY_OFFICER'));

auditLogsRouter.get(
  '/',
  validate({ query: listAuditLogsQuerySchema }),
  asyncHandler(listAuditLogs),
);

auditLogsRouter.get(
  '/:id',
  validate({ params: getAuditLogParamsSchema }),
  asyncHandler(getAuditLogDetail),
);

auditLogsRouter.get(
  '/:id/diff',
  validate({ params: getAuditLogParamsSchema }),
  asyncHandler(getAuditLogDiff),
);

