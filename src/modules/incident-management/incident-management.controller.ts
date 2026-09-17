import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  incidentParamsSchema,
  myIncidentsQuerySchema,
  reportIncidentBodySchema,
} from './dto/report-incident.dto.js';
import { incidentManagementService } from './incident-management.service.js';
export const reportIncident: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await incidentManagementService.report(
    reportIncidentBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(201).json({ success: true, data });
};
export const listMyIncidents: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await incidentManagementService.listMine(
    myIncidentsQuerySchema.parse(req.query),
    req.auth,
  );
  res.json({ success: true, data });
};
export const getMyIncident: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { incidentId } = incidentParamsSchema.parse(req.params);
  const data = await incidentManagementService.getMine(incidentId, req.auth);
  res.json({ success: true, data });
};
