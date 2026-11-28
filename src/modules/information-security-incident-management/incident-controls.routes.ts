import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getIncidentControlOptions,
  linkIncidentControl,
  unlinkIncidentControl,
} from './incident-controls.controller.js';
import {
  incidentControlLinkParamsSchema,
  incidentControlOptionsQuerySchema,
  incidentControlParamsSchema,
  linkIncidentControlBodySchema,
} from './dto/link-incident-control.dto.js';

export const incidentControlsRouter = Router();

// Supporting route for Link Incident to Control: load linkable controls.
incidentControlsRouter.get(
  '/:incidentId/controls/options',
  authenticate,
  validate({ params: incidentControlParamsSchema, query: incidentControlOptionsQuerySchema }),
  asyncHandler(getIncidentControlOptions),
);

// Use case: Link Incident to Control -> linkIncidentControl.
incidentControlsRouter.post(
  '/:incidentId/controls',
  authenticate,
  validate({ params: incidentControlParamsSchema, body: linkIncidentControlBodySchema }),
  asyncHandler(linkIncidentControl),
);

// Supporting action: remove an existing incident-control link.
incidentControlsRouter.delete(
  '/:incidentId/controls/:controlId',
  authenticate,
  validate({ params: incidentControlLinkParamsSchema }),
  asyncHandler(unlinkIncidentControl),
);
