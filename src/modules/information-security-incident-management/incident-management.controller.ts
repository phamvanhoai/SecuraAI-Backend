import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  classificationQueueQuerySchema,
  classifyIncidentBodySchema,
  assignIncidentBodySchema,
  updateIncidentProgressBodySchema,
  uploadIncidentEvidenceBodySchema,
  incidentEvidenceParamsSchema,
  incidentEvidenceQuerySchema,
  removeIncidentEvidenceBodySchema,
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
export const listIncidentsForClassification: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await incidentManagementService.listForClassification(
    classificationQueueQuerySchema.parse(req.query),
    req.auth,
  );
  res.json({ success: true, data });
};
export const classifyIncidentSeverity: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { incidentId } = incidentParamsSchema.parse(req.params);
  const data = await incidentManagementService.classify(
    incidentId,
    classifyIncidentBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.json({ success: true, data });
};
export const listIncidentAssignmentOptions: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({ success: true, data: await incidentManagementService.assignmentOptions(req.auth) });
};
export const assignIncidentHandler: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { incidentId } = incidentParamsSchema.parse(req.params);
  const data = await incidentManagementService.assign(
    incidentId,
    assignIncidentBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.json({ success: true, data });
};
export const updateIncidentHandlingProgress: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { incidentId } = incidentParamsSchema.parse(req.params);
  const data = await incidentManagementService.updateProgress(
    incidentId,
    updateIncidentProgressBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.json({ success: true, data });
};
export const listIncidentEvidence: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { incidentId } = incidentParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await incidentManagementService.listEvidence(
      incidentId,
      incidentEvidenceQuerySchema.parse(req.query),
      req.auth,
    ),
  });
};
export const uploadIncidentEvidence: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (!req.file) throw new AppError(422, 'EVIDENCE_FILE_REQUIRED', 'An evidence file is required');
  const { incidentId } = incidentParamsSchema.parse(req.params);
  const data = await incidentManagementService.uploadEvidence(
    incidentId,
    uploadIncidentEvidenceBodySchema.parse(req.body),
    { originalName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer },
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(201).json({ success: true, data });
};
export const downloadIncidentEvidence: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { evidenceId } = incidentEvidenceParamsSchema.parse(req.params);
  const file = await incidentManagementService.downloadEvidence(evidenceId, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.type(file.mimeType);
  res.download(file.absolutePath, file.name);
};
export const removeIncidentEvidence: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { evidenceId } = incidentEvidenceParamsSchema.parse(req.params);
  const data = await incidentManagementService.removeEvidence(
    evidenceId,
    removeIncidentEvidenceBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.json({ success: true, data });
};
