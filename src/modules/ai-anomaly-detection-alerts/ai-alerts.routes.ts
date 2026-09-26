import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createAiAlertFeedback,
  confirmAiAlertAsIncident,
  listAiAlertFeedback,
  listAiAlerts,
  getAiAlertExplanation,
  getAiAlertMetrics,
  markAiAlertFalsePositive,
  listAlertThresholds,
  setAlertThreshold,
  listModelVersions,
} from './ai-alerts.controller.js';
import { listAiAlertsQuerySchema } from './dto/list-ai-alerts.dto.js';
import {
  aiAlertIdParamsSchema,
  createAiAlertFeedbackSchema,
  listAiAlertFeedbackQuerySchema,
} from './dto/ai-alert-feedback.dto.js';
import { confirmAiAlertSchema } from './dto/confirm-ai-alert.dto.js';
import { markAiAlertFalsePositiveSchema } from './dto/mark-ai-alert-false-positive.dto.js';
import {
  alertThresholdAssetParamsSchema,
  listAlertThresholdsQuerySchema,
  setAlertThresholdBodySchema,
} from './dto/alert-threshold.dto.js';
import { listModelVersionsQuerySchema } from './dto/list-model-versions.dto.js';

export const aiAlertsRouter = Router();
aiAlertsRouter.get(
  '/models',
  authenticate,
  validate({ query: listModelVersionsQuerySchema }),
  asyncHandler(listModelVersions),
);
aiAlertsRouter.get('/metrics', authenticate, asyncHandler(getAiAlertMetrics));
aiAlertsRouter.get(
  '/thresholds',
  authenticate,
  validate({ query: listAlertThresholdsQuerySchema }),
  asyncHandler(listAlertThresholds),
);
aiAlertsRouter.put(
  '/thresholds/:assetId',
  authenticate,
  validate({ params: alertThresholdAssetParamsSchema, body: setAlertThresholdBodySchema }),
  asyncHandler(setAlertThreshold),
);
aiAlertsRouter.get(
  '/',
  authenticate,
  validate({ query: listAiAlertsQuerySchema }),
  asyncHandler(listAiAlerts),
);
aiAlertsRouter.get(
  '/:alertId/explanation',
  authenticate,
  validate({ params: aiAlertIdParamsSchema }),
  asyncHandler(getAiAlertExplanation),
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
aiAlertsRouter.post(
  '/:alertId/confirm-incident',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, body: confirmAiAlertSchema }),
  asyncHandler(confirmAiAlertAsIncident),
);
aiAlertsRouter.post(
  '/:alertId/false-positive',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, body: markAiAlertFalsePositiveSchema }),
  asyncHandler(markAiAlertFalsePositive),
);
