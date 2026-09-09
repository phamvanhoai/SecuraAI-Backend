import type { Request, RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { aiAlertsService } from './ai-alerts.service.js';
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
import { confirmAlertBodySchema } from './dto/confirm-alert.dto.js';

const requestContext = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
});

export const listModelConfigurations: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = listModelConfigurationsQuerySchema.parse(req.query);
  const data = await aiAlertsService.listModelConfigurations(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const listAlerts: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = listAlertsQuerySchema.parse(req.query);
  const data = await aiAlertsService.listAlerts(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const evaluateAlertReliability: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = alertIdParamsSchema.parse(req.params);
  const body = evaluateAlertReliabilityBodySchema.parse(req.body);
  const data = await aiAlertsService.evaluateAlertReliability(
    alertId,
    body,
    req.auth,
    requestContext(req),
  );
  res.status(201).json({ success: true, data });
};

export const confirmAlertAsIncident: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { alertId } = alertIdParamsSchema.parse(req.params);
  const body = confirmAlertBodySchema.parse(req.body);
  const data = await aiAlertsService.confirmAlertAsIncident(
    alertId,
    body,
    req.auth,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
};

export const createModelConfiguration: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const body = createModelConfigurationBodySchema.parse(req.body);
  const data = await aiAlertsService.createModelConfiguration(body, req.auth, requestContext(req));
  res.status(201).json({ success: true, data });
};

export const activateModelConfiguration: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { modelVersionId } = modelVersionParamsSchema.parse(req.params);
  const data = await aiAlertsService.activateModelConfiguration(
    modelVersionId,
    req.auth,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
};

export const aiAlertsController = {
  activateModelConfiguration,
  createModelConfiguration,
  listAlerts,
  listModelConfigurations,
  evaluateAlertReliability,
  confirmAlertAsIncident,
} as const;
