import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  eventIdParamSchema,
  listNormalizedEventsQuerySchema,
  updateEntityMappingSchema,
} from './dto/list-normalized-events.dto.js';
import { normalizedEventsService } from './normalized-events.service.js';

/** Ensures the request carries a valid authenticated user ID populated by the auth middleware. */
function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return value;
}

/** HTTP handler for GET /api/v1/events: lists and filters normalized events with pagination. */
export const listNormalizedEvents: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const query = listNormalizedEventsQuerySchema.parse(req.query);
  const data = await normalizedEventsService.listEvents(userId, query);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for GET /api/v1/events/:id: returns detailed event payload, entity mapping, and history. */
export const getNormalizedEventDetail: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventIdParamSchema.parse(req.params);
  const data = await normalizedEventsService.getEventDetail(userId, params.id);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for PUT/PATCH /api/v1/events/:id/mappings: applies manual user/asset entity mapping corrections. */
export const updateEntityMapping: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventIdParamSchema.parse(req.params);
  const body = updateEntityMappingSchema.parse(req.body);
  const data = await normalizedEventsService.updateEventMapping(userId, params.id, body);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for GET /api/v1/events/mapping-options: returns selectable users, assets, and monitored accounts. */
export const getMappingOptions: RequestHandler = async (_req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const data = await normalizedEventsService.getMappingOptions(userId);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for GET /api/v1/events/metrics: returns aggregated normalized event counts and breakdown. */
export const getNormalizedEventMetrics: RequestHandler = async (_req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const data = await normalizedEventsService.getMetrics(userId);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for POST /api/v1/events/:id/detection/retry: retries a failed AI detection job. */
export const retryEventDetection: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventIdParamSchema.parse(req.params);
  const data = await normalizedEventsService.retryDetection(userId, params.id);
  res.status(200).json({ success: true, data });
};
