import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  createLogSourceBodySchema,
  listLogSourcesQuerySchema,
  logSourceParamsSchema,
  updateLogSourceBodySchema,
} from './dto/log-source.dto.js';
import { securityMonitoringService } from './security-monitoring.service.js';
import { ingestSecurityEventsBodySchema } from './dto/security-event.dto.js';

const requestContext = (req: Parameters<RequestHandler>[0]) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
});

export const listLogSources: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = listLogSourcesQuerySchema.parse(req.query);
  const data = await securityMonitoringService.listLogSources(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const createLogSource: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const body = createLogSourceBodySchema.parse(req.body);
  const data = await securityMonitoringService.createLogSource(body, req.auth, requestContext(req));
  res.status(201).json({ success: true, data });
};

export const updateLogSource: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { logSourceId } = logSourceParamsSchema.parse(req.params);
  const body = updateLogSourceBodySchema.parse(req.body);
  const data = await securityMonitoringService.updateLogSource(
    logSourceId,
    body,
    req.auth,
    requestContext(req),
  );
  res.status(200).json({ success: true, data });
};

export const ingestSecurityEvents: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { logSourceId } = logSourceParamsSchema.parse(req.params);
  const body = ingestSecurityEventsBodySchema.parse(req.body);
  const data = await securityMonitoringService.ingestSecurityEvents(
    logSourceId,
    body,
    req.auth,
    requestContext(req),
  );
  res.status(202).json({ success: true, data });
};

export const securityMonitoringController = {
  createLogSource,
  ingestSecurityEvents,
  listLogSources,
  updateLogSource,
} as const;
