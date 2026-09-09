import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  activateModelConfiguration,
  createModelConfiguration,
  evaluateAlertReliability,
  listAlerts,
  listModelConfigurations,
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
} from './dto/alert-feedback.dto.js';

export const aiAlertsRouter = Router();

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
