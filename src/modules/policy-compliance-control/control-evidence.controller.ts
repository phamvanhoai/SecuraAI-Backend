import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { controlParamsSchema } from './dto/manage-control.dto.js';
import {
  addControlEvidenceSchema,
  linkControlEvidenceSchema,
  listControlEvidenceSchema,
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
