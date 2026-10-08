import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizePermission } from '../../common/middleware/authorize-permission.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { searchSystemLogsQuerySchema } from './dto/search-system-logs.dto.js';
import { searchSystemLogs } from './system-logs.controller.js';
import { exportInvestigationLogs } from './system-logs.controller.js';
import { exportInvestigationLogsSchema } from './dto/export-investigation-logs.dto.js';

export const systemLogsRouter = Router();
systemLogsRouter.get(
  '/',
  authenticate,
  authorizePermission('system-logs.search'),
  validate({ query: searchSystemLogsQuerySchema }),
  asyncHandler(searchSystemLogs),
);
systemLogsRouter.post(
  '/export',
  authenticate,
  authorizePermission('system-logs.export'),
  validate({ body: exportInvestigationLogsSchema }),
  asyncHandler(exportInvestigationLogs),
);
