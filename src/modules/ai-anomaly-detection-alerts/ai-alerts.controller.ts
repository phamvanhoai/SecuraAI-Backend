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

export const listAiAlerts: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await aiAlertsService.list(userId, listAiAlertsQuerySchema.parse(req.query));
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
