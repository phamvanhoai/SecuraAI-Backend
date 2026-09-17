import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  classifyIncidentSeverity,
  assignIncidentHandler,
  listIncidentAssignmentOptions,
  updateIncidentHandlingProgress,
  listIncidentEvidence,
  uploadIncidentEvidence,
  downloadIncidentEvidence,
  getMyIncident,
  listIncidentsForClassification,
  listMyIncidents,
  reportIncident,
} from './incident-management.controller.js';
import {
  classificationQueueQuerySchema,
  classifyIncidentBodySchema,
  assignIncidentBodySchema,
  updateIncidentProgressBodySchema,
  incidentParamsSchema,
  incidentEvidenceQuerySchema,
  myIncidentsQuerySchema,
  reportIncidentBodySchema,
} from './dto/report-incident.dto.js';
import { uploadIncidentEvidenceFile } from './incident-evidence.upload.js';

export const incidentManagementRouter = Router();

incidentManagementRouter.get(
  '/evidence/:evidenceId/download',
  authenticate,
  authorize('incidents.evidence.manage'),
  asyncHandler(downloadIncidentEvidence),
);
incidentManagementRouter.get(
  '/:incidentId/evidence',
  authenticate,
  authorize('incidents.evidence.manage'),
  validate({ params: incidentParamsSchema, query: incidentEvidenceQuerySchema }),
  asyncHandler(listIncidentEvidence),
);
incidentManagementRouter.post(
  '/:incidentId/evidence',
  authenticate,
  authorize('incidents.evidence.manage'),
  uploadIncidentEvidenceFile,
  asyncHandler(uploadIncidentEvidence),
);
incidentManagementRouter.get(
  '/assignment-options',
  authenticate,
  authorize('incidents.assign'),
  asyncHandler(listIncidentAssignmentOptions),
);
incidentManagementRouter.patch(
  '/:incidentId/progress',
  authenticate,
  authorize('incidents.update-progress'),
  validate({ params: incidentParamsSchema, body: updateIncidentProgressBodySchema }),
  asyncHandler(updateIncidentHandlingProgress),
);
incidentManagementRouter.patch(
  '/:incidentId/assignee',
  authenticate,
  authorize('incidents.assign'),
  validate({ params: incidentParamsSchema, body: assignIncidentBodySchema }),
  asyncHandler(assignIncidentHandler),
);
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
