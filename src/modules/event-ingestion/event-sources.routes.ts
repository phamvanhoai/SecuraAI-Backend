import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createEventSource,
  getEventSourceDetail,
  listEventSources,
} from './event-sources.controller.js';
import { createEventSourceSchema } from './dto/create-event-source.dto.js';
import { listEventSourcesQuerySchema } from './dto/list-event-sources.dto.js';
import { eventSourceIdParamsSchema } from './dto/get-event-source-detail.dto.js';

export const eventSourcesRouter = Router();

eventSourcesRouter.get(
  '/',
  authenticate,
  validate({ query: listEventSourcesQuerySchema }),
  asyncHandler(listEventSources),
);

eventSourcesRouter.get(
  '/:id',
  authenticate,
  validate({ params: eventSourceIdParamsSchema }),
  asyncHandler(getEventSourceDetail),
);

eventSourcesRouter.post(
  '/',
  authenticate,
  validate({ body: createEventSourceSchema }),
  asyncHandler(createEventSource),
);
