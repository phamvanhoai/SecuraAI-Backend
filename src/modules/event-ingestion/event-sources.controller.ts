import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { createEventSourceSchema } from './dto/create-event-source.dto.js';
import { listEventSourcesQuerySchema } from './dto/list-event-sources.dto.js';
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
