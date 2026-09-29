import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { getIncidentControlOptions, linkIncidentControl } from './incident-controls.controller.js';
import {
  incidentControlParamsSchema,
  linkIncidentControlBodySchema,
} from './dto/link-incident-control.dto.js';

export const incidentControlsRouter = Router();
incidentControlsRouter.get(
  '/:incidentId/controls/options',
  authenticate,
  validate({ params: incidentControlParamsSchema }),
  asyncHandler(getIncidentControlOptions),
);
incidentControlsRouter.post(
  '/:incidentId/controls',
  authenticate,
  validate({ params: incidentControlParamsSchema, body: linkIncidentControlBodySchema }),
  asyncHandler(linkIncidentControl),
);
