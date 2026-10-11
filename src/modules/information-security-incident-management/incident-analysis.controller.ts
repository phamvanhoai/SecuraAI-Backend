import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { incidentDetailParamsSchema } from './dto/view-incidents.dto.js';
import {
  analysisHistoryQuerySchema,
  saveIncidentAnalysisSchema,
} from './dto/incident-analysis.dto.js';
import { incidentAnalysisService } from './incident-analysis.service.js';
function actor(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const getIncidentAnalysis: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await incidentAnalysisService.current(actor(res.locals.authenticatedUserId), incidentId),
  });
};
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
