import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { controlParamsSchema } from './dto/manage-control.dto.js';
import {
  addControlEvidenceSchema,
  linkControlEvidenceSchema,
  unlinkControlEvidenceSchema,
  listControlEvidenceSchema,
  uploadControlEvidenceFieldsSchema,
  evidenceParamsSchema,
} from './dto/control-evidence.dto.js';
import { controlEvidenceService } from './control-evidence.service.js';
function actor(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const listControlEvidence: RequestHandler = async (req, res) => {
  const data = await controlEvidenceService.list(
    actor(res.locals.authenticatedUserId),
    controlParamsSchema.parse(req.params).controlId,
    listControlEvidenceSchema.parse(req.query),
  );
  res.json({ success: true, data });
};
export const addControlEvidence: RequestHandler = async (req, res) => {
  const data = await controlEvidenceService.add(
    actor(res.locals.authenticatedUserId),
    controlParamsSchema.parse(req.params).controlId,
    addControlEvidenceSchema.parse(req.body),
  );
  res.status(data.created ? 201 : 200).json({ success: true, data });
};
export const linkControlEvidence: RequestHandler = async (req, res) => {
  const data = await controlEvidenceService.link(
    actor(res.locals.authenticatedUserId),
    controlParamsSchema.parse(req.params).controlId,
    linkControlEvidenceSchema.parse(req.body),
  );
  res.status(data.linked ? 201 : 200).json({ success: true, data });
};
export const unlinkControlEvidence: RequestHandler = async (req, res) => {
  const params = controlParamsSchema
    .merge(evidenceParamsSchema)
    .parse(req.params);
  const data = await controlEvidenceService.unlink(
    actor(res.locals.authenticatedUserId),
    params.controlId,
    params.evidenceId,
    unlinkControlEvidenceSchema.parse(req.body),
  );
  res.json({ success: true, data });
};
export const uploadControlEvidence: RequestHandler = async (req, res) => {
  if (!req.file) throw new AppError(422, 'EVIDENCE_FILE_REQUIRED', 'Choose one evidence file');
  const data = await controlEvidenceService.upload(
    actor(res.locals.authenticatedUserId),
    controlParamsSchema.parse(req.params).controlId,
    uploadControlEvidenceFieldsSchema.parse(req.body),
    req.file,
  );
  res.status(data.created ? 201 : 200).json({ success: true, data });
};
export const downloadControlEvidence: RequestHandler = async (req, res) => {
  const { evidenceId } = evidenceParamsSchema.parse(req.params);
  const data = await controlEvidenceService.download(
    actor(res.locals.authenticatedUserId),
    evidenceId,
  );
  res.setHeader('Content-Type', data.mimeType);
  res.setHeader('Content-Length', String(data.buffer.length));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-SHA256', data.sha256);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(data.fileName)}`,
  );
  res.send(data.buffer);
};
