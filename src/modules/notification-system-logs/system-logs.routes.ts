import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizeRoles } from '../../common/middleware/authorize-roles.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { searchSystemLogsQuerySchema } from './dto/search-system-logs.dto.js';
import { searchSystemLogs, configurationHistory } from './system-logs.controller.js';
import { exportInvestigationLogs } from './system-logs.controller.js';
import { exportInvestigationLogsSchema } from './dto/export-investigation-logs.dto.js';

export const systemLogsRouter = Router();
systemLogsRouter.get('/configuration-history', authenticate, authorizeRoles('ADMIN'), asyncHandler(configurationHistory));
systemLogsRouter.get(
  '/',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ query: searchSystemLogsQuerySchema }),
  asyncHandler(searchSystemLogs),
);
systemLogsRouter.post(
  '/export',
  authenticate,
  authorizeRoles('ADMIN'),
  validate({ body: exportInvestigationLogsSchema }),
  asyncHandler(exportInvestigationLogs),
);
