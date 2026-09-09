import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createLogSource,
  ingestSecurityEvents,
  listLogSources,
  updateLogSource,
} from './security-monitoring.controller.js';
import {
  createLogSourceBodySchema,
  listLogSourcesQuerySchema,
  logSourceParamsSchema,
  updateLogSourceBodySchema,
} from './dto/log-source.dto.js';
import { ingestSecurityEventsBodySchema } from './dto/security-event.dto.js';

export const securityMonitoringRouter = Router();

const ingestionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many ingestion requests' },
  },
});

securityMonitoringRouter.get(
  '/log-sources',
  authenticate,
  authorize('log-sources.read'),
  validate({ query: listLogSourcesQuerySchema }),
  asyncHandler(listLogSources),
);

securityMonitoringRouter.post(
  '/log-sources',
  authenticate,
  authorize('log-sources.manage'),
  validate({ body: createLogSourceBodySchema }),
  asyncHandler(createLogSource),
);

securityMonitoringRouter.patch(
  '/log-sources/:logSourceId',
  authenticate,
  authorize('log-sources.manage'),
  validate({ params: logSourceParamsSchema, body: updateLogSourceBodySchema }),
  asyncHandler(updateLogSource),
);

securityMonitoringRouter.post(
  '/log-sources/:logSourceId/events',
  ingestionLimiter,
  authenticate,
  authorize('security-events.ingest'),
  validate({ params: logSourceParamsSchema, body: ingestSecurityEventsBodySchema }),
  asyncHandler(ingestSecurityEvents),
);
