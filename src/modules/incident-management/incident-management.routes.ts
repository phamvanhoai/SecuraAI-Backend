import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  classifyIncidentSeverity,
  getMyIncident,
  listIncidentsForClassification,
  listMyIncidents,
  reportIncident,
} from './incident-management.controller.js';
import {
  classificationQueueQuerySchema,
  classifyIncidentBodySchema,
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
  '/',
  authenticate,
  authorize('incidents.classify'),
  validate({ query: classificationQueueQuerySchema }),
  asyncHandler(listIncidentsForClassification),
);
incidentManagementRouter.patch(
  '/:incidentId/severity',
  authenticate,
  authorize('incidents.classify'),
  validate({ params: incidentParamsSchema, body: classifyIncidentBodySchema }),
  asyncHandler(classifyIncidentSeverity),
);
incidentManagementRouter.get(
  '/:incidentId',
  authenticate,
  authorize('incidents.report'),
  validate({ params: incidentParamsSchema }),
  asyncHandler(getMyIncident),
);
