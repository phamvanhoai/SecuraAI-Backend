import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  activateModelConfiguration,
  markFalsePositive,
  createModelConfiguration,
  evaluateAlertReliability,
  getAlertExplanation,
  confirmAlertAsIncident,
  listAlerts,
  listAlertFeedback,
  listModelConfigurations,
  listAlertThresholds,
  setAlertThreshold,
} from './ai-alerts.controller.js';
import {
  createModelConfigurationBodySchema,
  listModelConfigurationsQuerySchema,
  modelVersionParamsSchema,
} from './dto/model-configuration.dto.js';
import { listAlertsQuerySchema } from './dto/alert-query.dto.js';
import {
  alertIdParamsSchema,
  evaluateAlertReliabilityBodySchema,
  listAlertFeedbackQuerySchema,
} from './dto/alert-feedback.dto.js';
import { confirmAlertBodySchema } from './dto/confirm-alert.dto.js';
import { falsePositiveBodySchema } from './dto/false-positive.dto.js';
import {
  alertThresholdAssetParamsSchema,
  listAlertThresholdsQuerySchema,
  setAlertThresholdBodySchema,
} from './dto/alert-threshold.dto.js';

export const aiAlertsRouter = Router();
aiAlertsRouter.get(
  '/thresholds',
  authenticate,
  authorize('ai-alerts.thresholds.manage'),
  validate({ query: listAlertThresholdsQuerySchema }),
  asyncHandler(listAlertThresholds),
);
aiAlertsRouter.put(
  '/thresholds/:assetId',
  authenticate,
  authorize('ai-alerts.thresholds.manage'),
  validate({ params: alertThresholdAssetParamsSchema, body: setAlertThresholdBodySchema }),
  asyncHandler(setAlertThreshold),
);
aiAlertsRouter.get(
  '/:alertId/explanation',
  authenticate,
  authorize('ai-alerts.read'),
  validate({ params: alertIdParamsSchema }),
  asyncHandler(getAlertExplanation),
);
aiAlertsRouter.post(
  '/:alertId/false-positive',
  authenticate,
  authorize('ai-alerts.mark-false-positive'),
  validate({ params: alertIdParamsSchema, body: falsePositiveBodySchema }),
  asyncHandler(markFalsePositive),
);

aiAlertsRouter.get(
  '/:alertId/feedback',
  authenticate,
  authorize('ai-alerts.feedback'),
  validate({ params: alertIdParamsSchema, query: listAlertFeedbackQuerySchema }),
  asyncHandler(listAlertFeedback),
);

aiAlertsRouter.get(
  '/',
  authenticate,
  authorize('ai-alerts.read'),
  validate({ query: listAlertsQuerySchema }),
  asyncHandler(listAlerts),
);

aiAlertsRouter.post(
  '/:alertId/feedback',
  authenticate,
  authorize('ai-alerts.feedback'),
  validate({ params: alertIdParamsSchema, body: evaluateAlertReliabilityBodySchema }),
  asyncHandler(evaluateAlertReliability),
);

aiAlertsRouter.post(
  '/:alertId/confirm-incident',
  authenticate,
  authorize('ai-alerts.confirm'),
  validate({ params: alertIdParamsSchema, body: confirmAlertBodySchema }),
  asyncHandler(confirmAlertAsIncident),
);

aiAlertsRouter.get(
  '/models',
  authenticate,
  authorize('ai-models.read'),
  validate({ query: listModelConfigurationsQuerySchema }),
  asyncHandler(listModelConfigurations),
);

aiAlertsRouter.post(
  '/models',
  authenticate,
  authorize('ai-models.manage'),
  validate({ body: createModelConfigurationBodySchema }),
  asyncHandler(createModelConfiguration),
);

aiAlertsRouter.post(
  '/models/:modelVersionId/activate',
  authenticate,
  authorize('ai-models.manage'),
  validate({ params: modelVersionParamsSchema }),
  asyncHandler(activateModelConfiguration),
);
