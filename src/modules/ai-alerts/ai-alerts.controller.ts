import type { Request, RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { aiAlertsService } from './ai-alerts.service.js';
import {
  createModelConfigurationBodySchema,
  listModelConfigurationsQuerySchema,
  modelVersionParamsSchema,
} from './dto/model-configuration.dto.js';

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
  listModelConfigurations,
} as const;
