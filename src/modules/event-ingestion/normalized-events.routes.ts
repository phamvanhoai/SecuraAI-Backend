import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizeRoles } from '../../common/middleware/authorize-roles.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  eventIdParamSchema,
  listNormalizedEventsQuerySchema,
  updateEntityMappingSchema,
} from './dto/list-normalized-events.dto.js';
import {
  getMappingOptions,
  getNormalizedEventDetail,
  getNormalizedEventMetrics,
  listNormalizedEvents,
  retryEventDetection,
  updateEntityMapping,
} from './normalized-events.controller.js';

export const normalizedEventsRouter = Router();

// Retrieve summary metrics of normalized events and mapping coverage
normalizedEventsRouter.get(
  '/metrics',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  asyncHandler(getNormalizedEventMetrics),
);

// Load ACTIVE users, assets, and monitored accounts for manual mapping dropdowns
normalizedEventsRouter.get(
  '/mapping-options',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  asyncHandler(getMappingOptions),
);

// Retrieve full details, active mapping, mapping history, and anomaly detections for one event
normalizedEventsRouter.get(
  '/:id',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ params: eventIdParamSchema }),
  asyncHandler(getNormalizedEventDetail),
);

// Review or correct user/asset entity mapping for a normalized event (PUT)
normalizedEventsRouter.put(
  '/:id/mappings',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ params: eventIdParamSchema, body: updateEntityMappingSchema }),
  asyncHandler(updateEntityMapping),
);

// Review or correct user/asset entity mapping for a normalized event (PATCH)
normalizedEventsRouter.patch(
  '/:id/mappings',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ params: eventIdParamSchema, body: updateEntityMappingSchema }),
  asyncHandler(updateEntityMapping),
);

// Re-queue a failed AI anomaly detection job for a normalized event
normalizedEventsRouter.post(
  '/:id/detection/retry',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ params: eventIdParamSchema }),
  asyncHandler(retryEventDetection),
);

// List, search, and filter normalized security events with pagination
normalizedEventsRouter.get(
  '/',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ query: listNormalizedEventsQuerySchema }),
  asyncHandler(listNormalizedEvents),
);
