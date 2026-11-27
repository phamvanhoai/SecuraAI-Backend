import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  controlWeaknessParamsSchema,
  controlWeaknessHistoryQuerySchema,
  recordControlWeaknessBodySchema,
} from './dto/record-control-weakness.dto.js';
import { controlWeaknessesService } from './control-weaknesses.service.js';
// Read the trusted user ID placed in response locals by authenticate.
function userId(value: unknown) {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
// Return paginated control weaknesses already recorded for the incident.
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
// Return linked controls that can be selected for a weakness record.
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
// Parse the incident and weakness body, then ask the service to record it.
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
