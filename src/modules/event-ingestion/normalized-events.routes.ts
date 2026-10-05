import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
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
  asyncHandler(getNormalizedEventMetrics),
);

normalizedEventsRouter.get(
  '/mapping-options',
  authenticate,
  asyncHandler(getMappingOptions),
);

normalizedEventsRouter.get(
  '/:id',
  authenticate,
  validate({ params: eventIdParamSchema }),
  asyncHandler(getNormalizedEventDetail),
);

normalizedEventsRouter.put(
  '/:id/mappings',
  authenticate,
  validate({ params: eventIdParamSchema, body: updateEntityMappingSchema }),
  asyncHandler(updateEntityMapping),
);

normalizedEventsRouter.get(
  '/',
  authenticate,
  validate({ query: listNormalizedEventsQuerySchema }),
  asyncHandler(listNormalizedEvents),
);
