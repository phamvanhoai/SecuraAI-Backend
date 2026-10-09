import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { incidentDetailParamsSchema } from './dto/view-incidents.dto.js';
import { closeIncidentSchema } from './dto/close-incident.dto.js';
import { incidentClosureService } from './incident-closure.service.js';
function user(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const getIncidentClosure: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await incidentClosureService.current(user(res.locals.authenticatedUserId), incidentId),
  });
};
export const closeIncident: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await incidentClosureService.close(
      user(res.locals.authenticatedUserId),
      incidentId,
      closeIncidentSchema.parse(req.body),
    ),
  });
};
