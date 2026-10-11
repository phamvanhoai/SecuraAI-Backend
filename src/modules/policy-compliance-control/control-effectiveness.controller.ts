import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  assessControlEffectivenessBodySchema,
  controlEffectivenessParamsSchema,
  listControlEffectivenessQuerySchema,
} from './dto/assess-control-effectiveness.dto.js';
import { controlEffectivenessService } from './control-effectiveness.service.js';
const userId = (value: unknown) => {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
};
export const listControlEffectiveness: RequestHandler = async (req, res) => {
  const data = await controlEffectivenessService.list(
    userId(res.locals.authenticatedUserId),
    listControlEffectivenessQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
export const assessControlEffectiveness: RequestHandler = async (req, res) => {
  const { controlId } = controlEffectivenessParamsSchema.parse(req.params);
  const data = await controlEffectivenessService.assess(
    userId(res.locals.authenticatedUserId),
    controlId,
    assessControlEffectivenessBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
