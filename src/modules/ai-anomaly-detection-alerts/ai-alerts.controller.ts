import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { listAiAlertsQuerySchema } from './dto/list-ai-alerts.dto.js';
import { aiAlertsService } from './ai-alerts.service.js';
import {
  aiAlertIdParamsSchema,
  createAiAlertFeedbackSchema,
  listAiAlertFeedbackQuerySchema,
} from './dto/ai-alert-feedback.dto.js';
import { confirmAiAlertSchema } from './dto/confirm-ai-alert.dto.js';
import { markAiAlertFalsePositiveSchema } from './dto/mark-ai-alert-false-positive.dto.js';
import { listModelVersionsQuerySchema } from './dto/list-model-versions.dto.js';
import {
  alertThresholdAssetParamsSchema,
  listAlertThresholdsQuerySchema,
  setAlertThresholdBodySchema,
} from './dto/alert-threshold.dto.js';

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

export const listAiAlerts: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await aiAlertsService.list(userId, listAiAlertsQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};

export const getAiAlertMetrics: RequestHandler = async (_req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await aiAlertsService.metrics(userId);
  res.status(200).json({ success: true, data });
};

export const getAiAlertExplanation: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = aiAlertIdParamsSchema.parse(req.params);
  const data = await aiAlertsService.getExplanation(userId, alertId);
  res.status(200).json({ success: true, data });
};

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
