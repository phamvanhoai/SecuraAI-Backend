import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { listAiAlerts } from './ai-alerts.controller.js';
import { listAiAlertsQuerySchema } from './dto/list-ai-alerts.dto.js';

export const aiAlertsRouter = Router();
aiAlertsRouter.get(
  '/',
  authenticate,
  validate({ query: listAiAlertsQuerySchema }),
  asyncHandler(listAiAlerts),
);
