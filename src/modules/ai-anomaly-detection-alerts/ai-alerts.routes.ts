import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createAiAlertFeedback,
  listAiAlertFeedback,
  listAiAlerts,
} from './ai-alerts.controller.js';
import { listAiAlertsQuerySchema } from './dto/list-ai-alerts.dto.js';
import {
  aiAlertIdParamsSchema,
  createAiAlertFeedbackSchema,
  listAiAlertFeedbackQuerySchema,
} from './dto/ai-alert-feedback.dto.js';

export const aiAlertsRouter = Router();
aiAlertsRouter.get(
  '/',
  authenticate,
  validate({ query: listAiAlertsQuerySchema }),
  asyncHandler(listAiAlerts),
);
aiAlertsRouter.get(
  '/:alertId/feedback',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, query: listAiAlertFeedbackQuerySchema }),
  asyncHandler(listAiAlertFeedback),
);
aiAlertsRouter.post(
  '/:alertId/feedback',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, body: createAiAlertFeedbackSchema }),
  asyncHandler(createAiAlertFeedback),
);
