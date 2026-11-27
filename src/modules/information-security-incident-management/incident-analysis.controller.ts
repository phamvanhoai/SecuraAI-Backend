import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { incidentDetailParamsSchema } from './dto/view-incidents.dto.js';
import {
  analysisHistoryQuerySchema,
  saveIncidentAnalysisSchema,
} from './dto/incident-analysis.dto.js';
import { incidentAnalysisService } from './incident-analysis.service.js';
// Parse request inputs and pass the authenticated user to the actor service flow.
function actor(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
// Parse request inputs and pass the authenticated user to the getIncidentAnalysis service flow.
export const getIncidentAnalysis: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await incidentAnalysisService.current(actor(res.locals.authenticatedUserId), incidentId),
  });
};
// Parse request inputs and pass the authenticated user to the saveIncidentAnalysis service flow.
export const saveIncidentAnalysis: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await incidentAnalysisService.save(
      actor(res.locals.authenticatedUserId),
      incidentId,
      saveIncidentAnalysisSchema.parse(req.body),
    ),
  });
};
// Parse request inputs and pass the authenticated user to the getIncidentAnalysisHistory service flow.
export const getIncidentAnalysisHistory: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await incidentAnalysisService.history(
      actor(res.locals.authenticatedUserId),
      incidentId,
      analysisHistoryQuerySchema.parse(req.query),
    ),
  });
};
