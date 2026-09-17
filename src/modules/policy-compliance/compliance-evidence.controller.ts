import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { assessmentEvidenceParamsSchema, evidenceParamsSchema, listEvidenceAssessmentsQuerySchema, uploadEvidenceBodySchema } from './dto/compliance-evidence.dto.js';
import { complianceEvidenceService } from './compliance-evidence.service.js';

const actor = (req: Parameters<RequestHandler>[0]) => { if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required'); return req.auth; };
export const listEvidenceAssessments: RequestHandler = async (req, res) => res.status(200).json({ success: true, data: await complianceEvidenceService.list(listEvidenceAssessmentsQuerySchema.parse(req.query), actor(req)) });
export const uploadComplianceEvidence: RequestHandler = async (req, res) => { const { assessmentId } = assessmentEvidenceParamsSchema.parse(req.params); if (!req.file) throw new AppError(422, 'EVIDENCE_FILE_REQUIRED', 'An evidence file is required'); const data = await complianceEvidenceService.upload(assessmentId, uploadEvidenceBodySchema.parse(req.body), { originalName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer }, actor(req), { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null }); res.status(201).json({ success: true, data }); };
export const downloadComplianceEvidence: RequestHandler = async (req, res) => { const { evidenceId } = evidenceParamsSchema.parse(req.params); const file = await complianceEvidenceService.download(evidenceId, actor(req)); res.type(file.mimeType); res.download(file.absolutePath, file.name); };
