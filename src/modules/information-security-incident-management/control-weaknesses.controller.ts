import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  controlWeaknessParamsSchema,
  controlWeaknessHistoryQuerySchema,
  recordControlWeaknessBodySchema,
} from './dto/record-control-weakness.dto.js';
import { controlWeaknessesService } from './control-weaknesses.service.js';
function userId(value: unknown) {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const listControlWeaknessHistory: RequestHandler = async (req, res) => {
  const { incidentId } = controlWeaknessParamsSchema.parse(req.params);
  res.status(200).json({
    success: true,
    data: await controlWeaknessesService.history(
      userId(res.locals.authenticatedUserId),
      incidentId,
      controlWeaknessHistoryQuerySchema.parse(req.query),
    ),
  });
};
export const getControlWeaknessOptions: RequestHandler = async (req, res) => {
  const { incidentId } = controlWeaknessParamsSchema.parse(req.params);
  res.status(200).json({
    success: true,
    data: await controlWeaknessesService.options(
      userId(res.locals.authenticatedUserId),
      incidentId,
    ),
  });
};
export const recordControlWeakness: RequestHandler = async (req, res) => {
  const { incidentId } = controlWeaknessParamsSchema.parse(req.params);
  res.status(201).json({
    success: true,
    data: await controlWeaknessesService.record(
      userId(res.locals.authenticatedUserId),
      incidentId,
      recordControlWeaknessBodySchema.parse(req.body),
    ),
  });
};
