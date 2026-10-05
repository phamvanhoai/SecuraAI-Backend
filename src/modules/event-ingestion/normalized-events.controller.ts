import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  eventIdParamSchema,
  listNormalizedEventsQuerySchema,
  updateEntityMappingSchema,
} from './dto/list-normalized-events.dto.js';
import { normalizedEventsService } from './normalized-events.service.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return value;
}

export const listNormalizedEvents: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const query = listNormalizedEventsQuerySchema.parse(req.query);
  const data = await normalizedEventsService.listEvents(userId, query);
  res.status(200).json({ success: true, data });
};

export const getNormalizedEventDetail: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventIdParamSchema.parse(req.params);
  const data = await normalizedEventsService.getEventDetail(userId, params.id);
  res.status(200).json({ success: true, data });
};

export const updateEntityMapping: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventIdParamSchema.parse(req.params);
  const body = updateEntityMappingSchema.parse(req.body);
  const data = await normalizedEventsService.updateEventMapping(userId, params.id, body);
  res.status(200).json({ success: true, data });
};

export const getMappingOptions: RequestHandler = async (_req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const data = await normalizedEventsService.getMappingOptions(userId);
  res.status(200).json({ success: true, data });
};

export const getNormalizedEventMetrics: RequestHandler = async (_req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const data = await normalizedEventsService.getMetrics(userId);
  res.status(200).json({ success: true, data });
};
