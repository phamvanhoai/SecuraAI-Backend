import { Router } from 'express';
import { incidentProgressSchema, phaseHistoryQuerySchema } from './dto/incident-progress.dto.js';
import { updateIncidentPhase, getIncidentPhaseHistory } from './incidents.controller.js';
import {
  getIncidentAnalysis,
  saveIncidentAnalysis,
  getIncidentAnalysisHistory,
} from './incident-analysis.controller.js';
import {
  saveIncidentAnalysisSchema,
  analysisHistoryQuerySchema,
} from './dto/incident-analysis.dto.js';
import {
  recordContainmentActionSchema,
  containmentHistoryQuerySchema,
} from './dto/record-containment-action.dto.js';
import { recordContainmentAction, getContainmentHistory } from './incidents.controller.js';
import { assignIncidentHandlerSchema } from './dto/assign-incident-handler.dto.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createIncidentFromSource,
  classifyIncidentSeverity,
  getClassificationHistory,
  getIncidentDetail,
  listIncidentSourceOptions,
  listIncidents,
  listIncidentAssignmentOptions,
  assignIncidentHandler,
  getAssignmentHistory,
} from './incidents.controller.js';
import {
  createIncidentFromSourceSchema,
  incidentSourceOptionsQuerySchema,
} from './dto/create-incident-from-source.dto.js';
import { incidentDetailParamsSchema, viewIncidentsQuerySchema } from './dto/view-incidents.dto.js';
import {
  classifyIncidentSeveritySchema,
  classificationHistoryQuerySchema,
} from './dto/classify-incident-severity.dto.js';

import {
  recordEradicationActionSchema,
  eradicationHistoryQuerySchema,
} from './dto/record-eradication-action.dto.js';
import { recordEradicationAction, getEradicationHistory } from './incidents.controller.js';
import {
  recordRecoveryActionSchema,
  recoveryHistoryQuerySchema,
} from './dto/record-recovery-action.dto.js';
import { recordRecoveryAction, getRecoveryHistory } from './incidents.controller.js';
export const incidentsRouter = Router();
incidentsRouter.patch(
  '/:incidentId/progress',
  authenticate,
  validate({ params: incidentDetailParamsSchema, body: incidentProgressSchema }),
  asyncHandler(updateIncidentPhase),
);
incidentsRouter.get(
  '/:incidentId/progress',
  authenticate,
  validate({ params: incidentDetailParamsSchema, query: phaseHistoryQuerySchema }),
  asyncHandler(getIncidentPhaseHistory),
);
incidentsRouter.get(
  '/:incidentId/analysis',
  authenticate,
  validate({ params: incidentDetailParamsSchema }),
  asyncHandler(getIncidentAnalysis),
);
incidentsRouter.patch(
  '/:incidentId/analysis',
  authenticate,
  validate({ params: incidentDetailParamsSchema, body: saveIncidentAnalysisSchema }),
  asyncHandler(saveIncidentAnalysis),
);
incidentsRouter.get(
  '/:incidentId/analysis/history',
  authenticate,
  validate({ params: incidentDetailParamsSchema, query: analysisHistoryQuerySchema }),
  asyncHandler(getIncidentAnalysisHistory),
);
incidentsRouter.post(
  '/:incidentId/eradication-actions',
  authenticate,
  validate({ params: incidentDetailParamsSchema, body: recordEradicationActionSchema }),
  asyncHandler(recordEradicationAction),
);
incidentsRouter.get(
  '/:incidentId/eradication-actions',
  authenticate,
  validate({ params: incidentDetailParamsSchema, query: eradicationHistoryQuerySchema }),
  asyncHandler(getEradicationHistory),
);
incidentsRouter.post(
  '/:incidentId/recovery-actions',
  authenticate,
  validate({ params: incidentDetailParamsSchema, body: recordRecoveryActionSchema }),
  asyncHandler(recordRecoveryAction),
);
incidentsRouter.get(
  '/:incidentId/recovery-actions',
  authenticate,
  validate({ params: incidentDetailParamsSchema, query: recoveryHistoryQuerySchema }),
  asyncHandler(getRecoveryHistory),
);
incidentsRouter.post(
  '/:incidentId/containment-actions',
  authenticate,
  validate({ params: incidentDetailParamsSchema, body: recordContainmentActionSchema }),
  asyncHandler(recordContainmentAction),
);
incidentsRouter.get(
  '/:incidentId/containment-actions',
  authenticate,
  validate({ params: incidentDetailParamsSchema, query: containmentHistoryQuerySchema }),
  asyncHandler(getContainmentHistory),
);

incidentsRouter.get(
  '/:incidentId/assignee',
  authenticate,
  validate({ params: incidentDetailParamsSchema, query: classificationHistoryQuerySchema }),
  asyncHandler(getAssignmentHistory),
);

incidentsRouter.get(
  '/assignment-options',
  authenticate,
  asyncHandler(listIncidentAssignmentOptions),
);
incidentsRouter.patch(
  '/:incidentId/assignee',
  authenticate,
  validate({ params: incidentDetailParamsSchema, body: assignIncidentHandlerSchema }),
  asyncHandler(assignIncidentHandler),
);

incidentsRouter.get(
  '/:incidentId/severity',
  authenticate,
  validate({ params: incidentDetailParamsSchema, query: classificationHistoryQuerySchema }),
  asyncHandler(getClassificationHistory),
);

incidentsRouter.patch(
  '/:incidentId/severity',
  authenticate,
  validate({ params: incidentDetailParamsSchema, body: classifyIncidentSeveritySchema }),
  asyncHandler(classifyIncidentSeverity),
);

incidentsRouter.post(
  '/',
  authenticate,
  validate({ body: createIncidentFromSourceSchema }),
  asyncHandler(createIncidentFromSource),
);

incidentsRouter.get(
  '/source-options',
  authenticate,
  validate({ query: incidentSourceOptionsQuerySchema }),
  asyncHandler(listIncidentSourceOptions),
);

incidentsRouter.get(
  '/',
  authenticate,
  validate({ query: viewIncidentsQuerySchema }),
  asyncHandler(listIncidents),
);

incidentsRouter.get(
  '/:incidentId',
  (req, _res, next) => {
    if (
      req.params.incidentId === 'mine' ||
      req.params.incidentId === 'assignment-options' ||
      req.params.incidentId === 'source-options'
    ) {
      next('route');
      return;
    }
    next();
  },
  authenticate,
  validate({ params: incidentDetailParamsSchema }),
  asyncHandler(getIncidentDetail),
);
