import type { RequestHandler } from 'express';
import { incidentProgressSchema, phaseHistoryQuerySchema } from './dto/incident-progress.dto.js';
export const updateIncidentPhase: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.updatePhase(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    incidentProgressSchema.parse(req.body),
  );
  res.json({ success: true, data });
};
export const getIncidentPhaseHistory: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.phaseHistory(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    phaseHistoryQuerySchema.parse(req.query),
  );
  res.json({ success: true, data });
};
import {
  recordContainmentActionSchema,
  containmentHistoryQuerySchema,
} from './dto/record-containment-action.dto.js';
export const recordContainmentAction: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.recordContainment(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    recordContainmentActionSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const getContainmentHistory: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.containmentHistory(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    containmentHistoryQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
import {
  recordEradicationActionSchema,
  eradicationHistoryQuerySchema,
} from './dto/record-eradication-action.dto.js';
export const recordEradicationAction: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.recordEradication(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    recordEradicationActionSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const getEradicationHistory: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.eradicationHistory(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    eradicationHistoryQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
import {
  recordRecoveryActionSchema,
  recoveryHistoryQuerySchema,
} from './dto/record-recovery-action.dto.js';
export const recordRecoveryAction: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.recordRecovery(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    recordRecoveryActionSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const getRecoveryHistory: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.recoveryHistory(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    recoveryHistoryQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
import { assignIncidentHandlerSchema } from './dto/assign-incident-handler.dto.js';

export const listIncidentAssignmentOptions: RequestHandler = async (_req, res) => {
  const data = await incidentsService.assignmentOptions(
    authenticatedUserId(res.locals.authenticatedUserId),
  );
  res.status(200).json({ success: true, data });
};
export const assignIncidentHandler: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.assignHandler(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    assignIncidentHandlerSchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};
import { AppError } from '../../common/errors/app-error.js';
import {
  createIncidentFromSourceSchema,
  incidentSourceOptionsQuerySchema,
} from './dto/create-incident-from-source.dto.js';
import { incidentDetailParamsSchema, viewIncidentsQuerySchema } from './dto/view-incidents.dto.js';
import { incidentsService } from './incidents.service.js';
import {
  classifyIncidentSeveritySchema,
  classificationHistoryQuerySchema,
} from './dto/classify-incident-severity.dto.js';

export const getClassificationHistory: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.classificationHistory(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    classificationHistoryQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const getAssignmentHistory: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.assignmentHistory(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    classificationHistoryQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const classifyIncidentSeverity: RequestHandler = async (req, res) => {
  const { incidentId } = incidentDetailParamsSchema.parse(req.params);
  const data = await incidentsService.classifySeverity(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    classifyIncidentSeveritySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

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

export const listIncidentSourceOptions: RequestHandler = async (req, res) => {
  const data = await incidentsService.listSourceOptions(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentSourceOptionsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const createIncidentFromSource: RequestHandler = async (req, res) => {
  const data = await incidentsService.createFromSource(
    authenticatedUserId(res.locals.authenticatedUserId),
    createIncidentFromSourceSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
