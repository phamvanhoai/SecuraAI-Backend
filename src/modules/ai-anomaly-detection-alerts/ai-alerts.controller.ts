import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { extractClientContext } from '../../common/utils/client-context.js';
import { listAiAlertsQuerySchema } from './dto/list-ai-alerts.dto.js';
import { aiAlertsService } from './ai-alerts.service.js';
import {
  aiAlertIdParamsSchema,
  createAiAlertFeedbackSchema,
  listAiAlertFeedbackQuerySchema,
} from './dto/ai-alert-feedback.dto.js';
import { confirmAiAlertSchema } from './dto/confirm-ai-alert.dto.js';
import { markAiAlertFalsePositiveSchema } from './dto/mark-ai-alert-false-positive.dto.js';
import { markAiAlertFurtherInvestigationSchema } from './dto/mark-ai-alert-further-investigation.dto.js';
import { listModelVersionsQuerySchema } from './dto/list-model-versions.dto.js';
import {
  alertThresholdAssetParamsSchema,
  listAlertThresholdAssetOptionsQuerySchema,
  listAlertThresholdsQuerySchema,
  setAlertThresholdBodySchema,
} from './dto/alert-threshold.dto.js';
import { configureDetectionThresholdSchema } from './dto/detection-threshold.dto.js';
import { regenerateAlertExplanationSchema } from './dto/regenerate-alert-explanation.dto.js';
import { aiAlertRealtimeService } from './ai-alert-realtime.service.js';

export const issueAiAlertRealtimeTicket: RequestHandler = async (_req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.status(200).json({
    success: true,
    data: await aiAlertRealtimeService.issueTicket(userId),
  });
};

// Return the current threshold for the deployed model.
export const getDetectionThreshold: RequestHandler = async (_req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res
    .status(200)
    .json({ success: true, data: await aiAlertsService.getDetectionThreshold(userId) });
};

export const configureDetectionThreshold: RequestHandler = async (req, res) => {
  // authenticate already verified the token and stored the user ID here.
  // The controller reads it instead of trusting a user ID from the request body.
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

  // Read the IP address and user agent so the change can be audited.
  // The service receives the user, validated input, and request information.
  const context = extractClientContext(req);
  const data = await aiAlertsService.configureDetectionThreshold(
    userId,
    configureDetectionThresholdSchema.parse(req.body),
    context,
  );
  res.status(200).json({ success: true, data });
};

// Parse list filters and return the saved asset-specific thresholds.
export const listAlertThresholds: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await aiAlertsService.listAlertThresholds(
    userId,
    listAlertThresholdsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

// Return active assets that can be selected for a custom threshold.
export const listAlertThresholdAssetOptions: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { q } = listAlertThresholdAssetOptionsQuerySchema.parse(req.query);
  const data = await aiAlertsService.listActiveAssetOptions(userId, q);
  res.status(200).json({ success: true, data });
};

// Parse the asset ID and threshold body, then call the service to save it.
export const setAlertThreshold: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { assetId } = alertThresholdAssetParamsSchema.parse(req.params);
  const data = await aiAlertsService.setAlertThreshold(
    userId,
    assetId,
    setAlertThresholdBodySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

// Return one validated, paginated page of model versions and metrics.
export const listModelVersions: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await aiAlertsService.listModelVersions(
    userId,
    listModelVersionsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

// Return one validated, filtered and paginated page of alerts.
export const listAiAlerts: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await aiAlertsService.list(userId, listAiAlertsQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};

// Start triage for the selected alert using the authenticated analyst ID.
export const startAiAlertTriage: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.startTriage(userId, alertId);
  res.status(200).json({ success: true, data });
};

export const getAiAlertMetrics: RequestHandler = async (_req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await aiAlertsService.metrics(userId);
  res.status(200).json({ success: true, data });
};

// Return the selected alert's score, feature evidence and stored explanation.
export const getAiAlertExplanation: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.getExplanation(userId, alertId);
  res.status(200).json({ success: true, data });
};

// Request a new explanation without changing the stored detection score.
export const regenerateAiAlertExplanation: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.regenerateExplanation(
    userId,
    alertId,
    regenerateAlertExplanationSchema.parse(req.body),
    extractClientContext(req),
  );
  res.status(200).json({ success: true, data });
};

// Record validated analyst feedback for the selected alert.
export const createAiAlertFeedback: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.createFeedback(
    userId,
    alertId,
    createAiAlertFeedbackSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};

// Return the selected alert's paginated feedback history.
export const listAiAlertFeedback: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.listFeedback(
    userId,
    alertId,
    listAiAlertFeedbackQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

// Confirm the selected alert using the authenticated analyst and validated comment.
export const confirmAiAlertAsIncident: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.confirmAsIncident(
    userId,
    alertId,
    confirmAiAlertSchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

// Dismiss the selected alert as a false positive.
export const markAiAlertFalsePositive: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.markFalsePositive(
    userId,
    alertId,
    markAiAlertFalsePositiveSchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

// Keep the selected alert open for further investigation.
export const markAiAlertFurtherInvestigation: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.markFurtherInvestigation(
    userId,
    alertId,
    markAiAlertFurtherInvestigationSchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};
