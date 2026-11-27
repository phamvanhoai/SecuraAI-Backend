/**
 * Layer: Route (Event Ingestion - Event Sources)
 * Purpose: Maps /api/v1/event-sources HTTP endpoints and wires auth, RBAC, and Zod validation middleware.
 * Flow: Express Router -> Middleware (authenticate, authorizeRoles, validate) -> Controller
 */
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

// Test connectivity using ad-hoc unsaved Wazuh connection inputs
eventSourcesRouter.post(
  '/test-connection',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ body: testEventSourceConnectionSchema }),
  asyncHandler(testEventSourceConnection),
);

// Test connectivity using the stored endpoint of an existing event source
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

// Retrieve summary details of a specific file-import ingestion batch
eventSourcesRouter.get(
  '/batches/:batchId',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ params: batchIdParamSchema }),
  asyncHandler(getBatchDetail),
);

// Retrieve paginated invalid event records captured during a specific import batch
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

// List historical ingestion batches belonging to a specific event source
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

// List configured event sources (paginated, filterable, sortable).
// Pipeline: JWT auth -> RBAC (ADMIN / SECURITY_OFFICER) -> Zod query validation -> controller.
// Registered before '/:id' so static routes are never shadowed by path parameters.
eventSourcesRouter.get(
  '/',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ query: listEventSourcesQuerySchema }),
  asyncHandler(listEventSources),
);

// Retrieve detailed information, masked API keys, and stats for a single event source
eventSourcesRouter.get(
  '/:id',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ params: eventSourceIdParamsSchema }),
  asyncHandler(getEventSourceDetail),
);

// Register a new normalized event source
eventSourcesRouter.post(
  '/',
  authenticate,
  authorizeRoles('ADMIN', 'SECURITY_OFFICER'),
  validate({ body: createEventSourceSchema }),
  asyncHandler(createEventSource),
);

// Full/partial update of event source configuration or enable/disable status (PUT)
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

// Partial update of event source configuration or enable/disable status (PATCH)
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

// Import and validate a batch of normalized events from an uploaded JSON/CSV payload
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
