import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getMyIncident,
  listMyIncidents,
  reportIncident,
} from './incident-management.controller.js';
import {
  incidentParamsSchema,
  myIncidentsQuerySchema,
  reportIncidentBodySchema,
} from './dto/report-incident.dto.js';

export const incidentManagementRouter = Router();

incidentManagementRouter.get(
  '/mine',
  authenticate,
  authorize('incidents.report'),
  validate({ query: myIncidentsQuerySchema }),
  asyncHandler(listMyIncidents),
);
incidentManagementRouter.post(
  '/',
  authenticate,
  authorize('incidents.report'),
  validate({ body: reportIncidentBodySchema }),
  asyncHandler(reportIncident),
);
incidentManagementRouter.get(
  '/:incidentId',
  authenticate,
  authorize('incidents.report'),
  validate({ params: incidentParamsSchema }),
  asyncHandler(getMyIncident),
);
