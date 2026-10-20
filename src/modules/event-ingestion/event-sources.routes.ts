import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizeRoles } from '../../common/middleware/authorize-roles.js';
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
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ body: testEventSourceConnectionSchema }),
  asyncHandler(testEventSourceConnection),
);

eventSourcesRouter.post(
  '/:id/test-connection',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
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
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ params: batchIdParamSchema }),
  asyncHandler(getBatchDetail),
);

eventSourcesRouter.get(
  '/batches/:batchId/invalid-events',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({
    params: batchIdParamSchema,
    query: getBatchInvalidEventsQuerySchema,
  }),
  asyncHandler(getBatchInvalidEvents),
);

eventSourcesRouter.get(
  '/:id/batches',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({
    params: eventSourceIdParamsSchema,
    query: getSourceBatchesQuerySchema,
  }),
  asyncHandler(getSourceBatches),
);

eventSourcesRouter.get(
  '/',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ query: listEventSourcesQuerySchema }),
  asyncHandler(listEventSources),
);

eventSourcesRouter.get(
  '/:id',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ params: eventSourceIdParamsSchema }),
  asyncHandler(getEventSourceDetail),
);

eventSourcesRouter.post(
  '/',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ body: createEventSourceSchema }),
  asyncHandler(createEventSource),
);

eventSourcesRouter.put(
  '/:id',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({
    params: updateEventSourceParamsSchema,
    body: updateEventSourceSchema,
  }),
  asyncHandler(updateEventSource),
);

eventSourcesRouter.patch(
  '/:id',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({
    params: updateEventSourceParamsSchema,
    body: updateEventSourceSchema,
  }),
  asyncHandler(updateEventSource),
);

eventSourcesRouter.post(
  '/:id/import',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({
    params: eventSourceIdParamsSchema,
    body: importEventsBodySchema,
  }),
  asyncHandler(importNormalizedEvents),
);
