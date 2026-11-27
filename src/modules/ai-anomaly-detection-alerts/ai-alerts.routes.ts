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
  regenerateAiAlertExplanation,
  getAiAlertMetrics,
  markAiAlertFalsePositive,
  markAiAlertFurtherInvestigation,
  startAiAlertTriage,
  listAlertThresholds,
  listAlertThresholdAssetOptions,
  setAlertThreshold,
  listModelVersions,
  getDetectionThreshold,
  configureDetectionThreshold,
  issueAiAlertRealtimeTicket,
} from './ai-alerts.controller.js';
import { listAiAlertsQuerySchema } from './dto/list-ai-alerts.dto.js';
import {
  aiAlertIdParamsSchema,
  createAiAlertFeedbackSchema,
  listAiAlertFeedbackQuerySchema,
} from './dto/ai-alert-feedback.dto.js';
import { confirmAiAlertSchema } from './dto/confirm-ai-alert.dto.js';
import { markAiAlertFalsePositiveSchema } from './dto/mark-ai-alert-false-positive.dto.js';
import { markAiAlertFurtherInvestigationSchema } from './dto/mark-ai-alert-further-investigation.dto.js';
import {
  alertThresholdAssetParamsSchema,
  listAlertThresholdAssetOptionsQuerySchema,
  listAlertThresholdsQuerySchema,
  setAlertThresholdBodySchema,
} from './dto/alert-threshold.dto.js';
import { listModelVersionsQuerySchema } from './dto/list-model-versions.dto.js';
import { configureDetectionThresholdSchema } from './dto/detection-threshold.dto.js';
import { regenerateAlertExplanationSchema } from './dto/regenerate-alert-explanation.dto.js';

export const aiAlertsRouter = Router();

// Supporting route: create a short-lived ticket for the real-time alert feed.
aiAlertsRouter.post('/realtime-ticket', authenticate, asyncHandler(issueAiAlertRealtimeTicket));

// Use case: View Model Version & Evaluation Metrics -> listModelVersions.
aiAlertsRouter.get(
  '/models',
  authenticate,
  validate({ query: listModelVersionsQuerySchema }),
  asyncHandler(listModelVersions),
);

// Supporting action for View XAI Explanation -> regenerateAiAlertExplanation.
aiAlertsRouter.post(
  '/:alertId/explanation/regenerate',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, body: regenerateAlertExplanationSchema }),
  asyncHandler(regenerateAiAlertExplanation),
);
aiAlertsRouter.get('/metrics', authenticate, asyncHandler(getAiAlertMetrics));

// Use case: Configure Detection Threshold -> read the current value.
aiAlertsRouter.get('/thresholds', authenticate, asyncHandler(getDetectionThreshold));

// Configure Detection Threshold flow:
// 1. authenticate verifies the access token and stores the user ID.
// 2. validate accepts a threshold from 0.5 to 1, including both limits.
// 3. the controller receives the validated HTTP request.
aiAlertsRouter.put(
  '/thresholds',
  authenticate,
  validate({ body: configureDetectionThresholdSchema }),
  asyncHandler(configureDetectionThreshold),
);

// Use case: Set Custom Alert Threshold -> load selectable assets.
aiAlertsRouter.get(
  '/thresholds/assets/options',
  authenticate,
  validate({ query: listAlertThresholdAssetOptionsQuerySchema }),
  asyncHandler(listAlertThresholdAssetOptions),
);

// Use case: Set Custom Alert Threshold -> list saved asset thresholds.
aiAlertsRouter.get(
  '/thresholds/assets',
  authenticate,
  validate({ query: listAlertThresholdsQuerySchema }),
  asyncHandler(listAlertThresholds),
);

// Use case: Set Custom Alert Threshold -> set one asset threshold.
aiAlertsRouter.put(
  '/thresholds/:assetId',
  authenticate,
  validate({ params: alertThresholdAssetParamsSchema, body: setAlertThresholdBodySchema }),
  asyncHandler(setAlertThreshold),
);

// Use cases: View Anomaly Alert List and Search / Filter Alerts -> listAiAlerts.
aiAlertsRouter.get(
  '/',
  authenticate,
  validate({ query: listAiAlertsQuerySchema }),
  asyncHandler(listAiAlerts),
);

// Use cases: View Alert Detail, View Anomaly Score,
// View Features Contributing to Anomaly, and View XAI Explanation.
aiAlertsRouter.get(
  '/:alertId/explanation',
  authenticate,
  validate({ params: aiAlertIdParamsSchema }),
  asyncHandler(getAiAlertExplanation),
);

// Supporting route: load the recorded analyst feedback history.
aiAlertsRouter.get(
  '/:alertId/feedback',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, query: listAiAlertFeedbackQuerySchema }),
  asyncHandler(listAiAlertFeedback),
);

// Use case: Start Analyst Triage -> startAiAlertTriage.
aiAlertsRouter.post(
  '/:alertId/triage/start',
  authenticate,
  validate({ params: aiAlertIdParamsSchema }),
  asyncHandler(startAiAlertTriage),
);

// Use case: Record Feedback Reason, Analyst, Time and Model Version.
aiAlertsRouter.post(
  '/:alertId/feedback',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, body: createAiAlertFeedbackSchema }),
  asyncHandler(createAiAlertFeedback),
);

// Use case: Confirm Alert as True Positive -> confirmAiAlertAsIncident.
aiAlertsRouter.post(
  '/:alertId/confirm-incident',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, body: confirmAiAlertSchema }),
  asyncHandler(confirmAiAlertAsIncident),
);

// Use case: Dismiss Alert as False Positive -> markAiAlertFalsePositive.
aiAlertsRouter.post(
  '/:alertId/false-positive',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, body: markAiAlertFalsePositiveSchema }),
  asyncHandler(markAiAlertFalsePositive),
);

// Use case: Mark Alert as Need Further Investigation.
aiAlertsRouter.post(
  '/:alertId/further-investigation',
  authenticate,
  validate({ params: aiAlertIdParamsSchema, body: markAiAlertFurtherInvestigationSchema }),
  asyncHandler(markAiAlertFurtherInvestigation),
);
