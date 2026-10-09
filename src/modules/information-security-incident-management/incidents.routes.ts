import { Router } from 'express';
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

export const incidentsRouter = Router();

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
