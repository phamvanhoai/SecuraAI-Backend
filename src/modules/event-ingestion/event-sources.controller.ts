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
import { eventSourcesService } from './event-sources.service.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return value;
}

export const createEventSource: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const input = createEventSourceSchema.parse(req.body);
  const data = await eventSourcesService.registerEventSource(userId, input);
  res.status(201).json({ success: true, data });
};

export const listEventSources: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const query = listEventSourcesQuerySchema.parse(req.query);
  const data = await eventSourcesService.listEventSources(userId, query);
  res.status(200).json({ success: true, data });
};

export const getEventSourceDetail: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventSourceIdParamsSchema.parse(req.params);
  const data = await eventSourcesService.getEventSourceDetail(userId, params.id);
  res.status(200).json({ success: true, data });
};

export const updateEventSource: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = updateEventSourceParamsSchema.parse(req.params);
  const input = updateEventSourceSchema.parse(req.body);
  const data = await eventSourcesService.updateEventSource(userId, params.id, input);
  res.status(200).json({ success: true, data });
};

export const testEventSourceConnection: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const input = testEventSourceConnectionSchema.parse(req.body);
  const data = await eventSourcesService.testConnection(userId, input);
  res.status(200).json({ success: true, data });
};

export const testEventSourceConnectionById: RequestHandler = async (req, res) => {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = eventSourceIdParamsSchema.parse(req.params);
  const input = testExistingEventSourceConnectionSchema.parse(req.body);
  const data = await eventSourcesService.testConnectionById(userId, params.id, input);
  res.status(200).json({ success: true, data });
};
