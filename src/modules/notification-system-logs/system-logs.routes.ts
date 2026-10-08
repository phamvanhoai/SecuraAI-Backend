import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizePermission } from '../../common/middleware/authorize-permission.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { searchSystemLogsQuerySchema } from './dto/search-system-logs.dto.js';
import { searchSystemLogs } from './system-logs.controller.js';

export const systemLogsRouter = Router();
systemLogsRouter.get(
  '/',
  authenticate,
  authorizePermission('system-logs.search'),
  validate({ query: searchSystemLogsQuerySchema }),
  asyncHandler(searchSystemLogs),
);
