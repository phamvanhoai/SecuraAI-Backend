import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createEventSource, listEventSources } from './event-sources.controller.js';
import { createEventSourceSchema } from './dto/create-event-source.dto.js';
import { listEventSourcesQuerySchema } from './dto/list-event-sources.dto.js';

export const eventSourcesRouter = Router();

eventSourcesRouter.get(
  '/',
  authenticate,
  validate({ query: listEventSourcesQuerySchema }),
  asyncHandler(listEventSources),
);

eventSourcesRouter.post(
  '/',
  authenticate,
  validate({ body: createEventSourceSchema }),
  asyncHandler(createEventSource),
);
