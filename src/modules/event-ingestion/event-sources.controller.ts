/**
 * Layer: Controller / HTTP Adapter (Event Ingestion - Event Sources)
 * Purpose: Translates validated HTTP requests into service calls and formats standard { success, data } responses.
 * Flow: Route -> Controller -> Service -> HTTP Response
 */
import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { createEventSourceSchema } from './dto/create-event-source.dto.js';
import { listEventSourcesQuerySchema } from './dto/list-event-sources.dto.js';
import { eventSourceIdParamsSchema } from './dto/get-event-source-detail.dto.js';
import {
  updateEventSourceParamsSchema,
  updateEventSourceSchema,
} from './dto/update-event-source.dto.js';
import {
  testEventSourceConnectionSchema,
  testExistingEventSourceConnectionSchema,
} from './dto/test-event-source-connection.dto.js';
import {
  batchIdParamSchema,
  getBatchInvalidEventsQuerySchema,
  getSourceBatchesQuerySchema,
  importEventsBodySchema,
} from './dto/import-events.dto.js';
import { eventSourcesService } from './event-sources.service.js';
import { eventImportService } from './event-import.service.js';

/** Ensures the request has a valid authenticated user ID populated by the auth middleware. */
function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return value;
}

/** HTTP handler for POST /api/v1/event-sources: registers a new event source configuration. */
export const createEventSource: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const input = createEventSourceSchema.parse(req.body);
  const data = await eventSourcesService.registerEventSource(userId, input);
  res.status(201).json({ success: true, data });
};

/**
 * HTTP handler for GET /api/v1/event-sources.
 * Extracts the authenticated user ID, parses the validated query params for strict typing,
 * delegates pagination/filtering to the service layer, and returns the standard envelope.
 */
export const listEventSources: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const query = listEventSourcesQuerySchema.parse(req.query);
  const data = await eventSourcesService.listEventSources(userId, query);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for GET /api/v1/event-sources/:id: fetches full source details, creator, API keys, and ingestion stats. */
export const getEventSourceDetail: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventSourceIdParamsSchema.parse(req.params);
  const data = await eventSourcesService.getEventSourceDetail(userId, params.id);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for PUT/PATCH /api/v1/event-sources/:id: updates source configuration or status. */
export const updateEventSource: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = updateEventSourceParamsSchema.parse(req.params);
  const input = updateEventSourceSchema.parse(req.body);
  const data = await eventSourcesService.updateEventSource(userId, params.id, input);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for POST /api/v1/event-sources/test-connection: tests connectivity using ad-hoc connection settings. */
export const testEventSourceConnection: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const input = testEventSourceConnectionSchema.parse(req.body);
  const data = await eventSourcesService.testConnection(userId, input);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for POST /api/v1/event-sources/:id/test-connection: tests connectivity for an existing saved source. */
export const testEventSourceConnectionById: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventSourceIdParamsSchema.parse(req.params);
  const input = testExistingEventSourceConnectionSchema.parse(req.body);
  const data = await eventSourcesService.testConnectionById(userId, params.id, input);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for POST /api/v1/event-sources/:id/import: imports a batch of normalized events for a source. */
export const importNormalizedEvents: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventSourceIdParamsSchema.parse(req.params);
  const input = importEventsBodySchema.parse(req.body);
  const data = await eventImportService.importNormalizedEvents(params.id, input, userId);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for GET /api/v1/event-sources/batches/:batchId: retrieves summary details for an ingestion batch. */
export const getBatchDetail: RequestHandler = async (req, res) => {
  authenticatedUserId(res.locals.authenticatedUserId);
  const params = batchIdParamSchema.parse(req.params);
  const data = await eventImportService.getBatchDetail(params.batchId);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for GET /api/v1/event-sources/batches/:batchId/invalid-events: lists invalid records from an import batch. */
export const getBatchInvalidEvents: RequestHandler = async (req, res) => {
  authenticatedUserId(res.locals.authenticatedUserId);
  const params = batchIdParamSchema.parse(req.params);
  const query = getBatchInvalidEventsQuerySchema.parse(req.query);
  const data = await eventImportService.getBatchInvalidEvents(params.batchId, query);
  res.status(200).json({ success: true, data });
};

/** HTTP handler for GET /api/v1/event-sources/:id/batches: lists historical ingestion batches for a specific source. */
export const getSourceBatches: RequestHandler = async (req, res) => {
  authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventSourceIdParamsSchema.parse(req.params);
  const query = getSourceBatchesQuerySchema.parse(req.query);
  const data = await eventImportService.getSourceBatches(params.id, query);
  res.status(200).json({ success: true, data });
};
