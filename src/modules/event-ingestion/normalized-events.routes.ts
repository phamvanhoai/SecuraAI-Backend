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
  updateEntityMapping,
} from './normalized-events.controller.js';

export const normalizedEventsRouter = Router();

normalizedEventsRouter.get(
  '/metrics',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  asyncHandler(getNormalizedEventMetrics),
);

normalizedEventsRouter.get(
  '/mapping-options',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  asyncHandler(getMappingOptions),
);

normalizedEventsRouter.get(
  '/:id',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ params: eventIdParamSchema }),
  asyncHandler(getNormalizedEventDetail),
);

normalizedEventsRouter.put(
  '/:id/mappings',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ params: eventIdParamSchema, body: updateEntityMappingSchema }),
  asyncHandler(updateEntityMapping),
);

normalizedEventsRouter.patch(
  '/:id/mappings',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ params: eventIdParamSchema, body: updateEntityMappingSchema }),
  asyncHandler(updateEntityMapping),
);

normalizedEventsRouter.get(
  '/',
  authenticate,
  authorizeRoles('SECURITY_OFFICER'),
  validate({ query: listNormalizedEventsQuerySchema }),
  asyncHandler(listNormalizedEvents),
);
