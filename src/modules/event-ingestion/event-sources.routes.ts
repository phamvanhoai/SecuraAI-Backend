import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createEventSource,
  getBatchDetail,
  getBatchInvalidEvents,
  getEventSourceDetail,
  getSourceBatches,
  importNormalizedEvents,
  listEventSources,
  testEventSourceConnection,
  testEventSourceConnectionById,
  updateEventSource,
} from './event-sources.controller.js';
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

export const eventSourcesRouter = Router();

eventSourcesRouter.post(
  '/test-connection',
  authenticate,
  validate({ body: testEventSourceConnectionSchema }),
  asyncHandler(testEventSourceConnection),
);

eventSourcesRouter.post(
  '/:id/test-connection',
  authenticate,
  validate({
    params: eventSourceIdParamsSchema,
    body: testExistingEventSourceConnectionSchema,
  }),
  asyncHandler(testEventSourceConnectionById),
);

// Batch detail & invalid events inspection endpoints
eventSourcesRouter.get(
  '/batches/:batchId',
  authenticate,
  validate({ params: batchIdParamSchema }),
  asyncHandler(getBatchDetail),
);

eventSourcesRouter.get(
  '/batches/:batchId/invalid-events',
  authenticate,
  validate({
    params: batchIdParamSchema,
    query: getBatchInvalidEventsQuerySchema,
  }),
  asyncHandler(getBatchInvalidEvents),
);

eventSourcesRouter.get(
  '/:id/batches',
  authenticate,
  validate({
    params: eventSourceIdParamsSchema,
    query: getSourceBatchesQuerySchema,
  }),
  asyncHandler(getSourceBatches),
);

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

eventSourcesRouter.put(
  '/:id',
  authenticate,
  validate({
    params: updateEventSourceParamsSchema,
    body: updateEventSourceSchema,
  }),
  asyncHandler(updateEventSource),
);

eventSourcesRouter.patch(
  '/:id',
  authenticate,
  validate({
    params: updateEventSourceParamsSchema,
    body: updateEventSourceSchema,
  }),
  asyncHandler(updateEventSource),
);

eventSourcesRouter.post(
  '/:id/import',
  authenticate,
  validate({
    params: eventSourceIdParamsSchema,
    body: importEventsBodySchema,
  }),
  asyncHandler(importNormalizedEvents),
);
