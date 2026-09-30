import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { incidentDetailParamsSchema, viewIncidentsQuerySchema } from './dto/view-incidents.dto.js';
import { incidentsService } from './incidents.service.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}

export const listIncidents: RequestHandler = async (req, res) => {
  const data = await incidentsService.list(
    authenticatedUserId(res.locals.authenticatedUserId),
    viewIncidentsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const getIncidentDetail: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.detail(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
  );
  res.status(200).json({ success: true, data });
};
