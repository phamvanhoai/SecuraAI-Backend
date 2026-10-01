import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { getIncidentDetail, listIncidents } from './incidents.controller.js';
import { incidentDetailParamsSchema, viewIncidentsQuerySchema } from './dto/view-incidents.dto.js';

export const incidentsRouter = Router();

incidentsRouter.get(
  '/',
  authenticate,
  validate({ query: viewIncidentsQuerySchema }),
  asyncHandler(listIncidents),
);

incidentsRouter.get(
  '/:incidentId',
  (req, _res, next) => {
    if (req.params.incidentId === 'mine' || req.params.incidentId === 'assignment-options') {
      next('route');
      return;
    }
    next();
  },
  authenticate,
  validate({ params: incidentDetailParamsSchema }),
  asyncHandler(getIncidentDetail),
);
