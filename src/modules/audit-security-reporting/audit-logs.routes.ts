import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { listAuditLogsQuerySchema } from './dto/list-audit-logs.dto.js';
import { listAuditLogs } from './audit-logs.controller.js';

export const auditLogsRouter = Router();

auditLogsRouter.get(
  '/',
  authenticate,
  validate({ query: listAuditLogsQuerySchema }),
  asyncHandler(listAuditLogs),
);
