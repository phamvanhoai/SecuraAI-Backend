import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { listNormalizedEventsQuerySchema } from './dto/list-normalized-events.dto.js';
import {
  getNormalizedEventMetrics,
  listNormalizedEvents,
} from './normalized-events.controller.js';

export const normalizedEventsRouter = Router();

normalizedEventsRouter.get(
  '/metrics',
  authenticate,
  asyncHandler(getNormalizedEventMetrics),
);

normalizedEventsRouter.get(
  '/',
  authenticate,
  validate({ query: listNormalizedEventsQuerySchema }),
  asyncHandler(listNormalizedEvents),
);
