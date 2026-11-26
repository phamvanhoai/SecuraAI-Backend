import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getControlWeaknessOptions,
  listControlWeaknessHistory,
  recordControlWeakness,
} from './control-weaknesses.controller.js';
import {
  controlWeaknessParamsSchema,
  controlWeaknessHistoryQuerySchema,
  recordControlWeaknessBodySchema,
} from './dto/record-control-weakness.dto.js';
export const controlWeaknessesRouter = Router();

// Supporting route: view weaknesses already recorded for the incident.
controlWeaknessesRouter.get(
  '/:incidentId/control-weaknesses',
  authenticate,
  validate({ params: controlWeaknessParamsSchema, query: controlWeaknessHistoryQuerySchema }),
  asyncHandler(listControlWeaknessHistory),
);

// Supporting route: load controls that can be recorded as weaknesses.
controlWeaknessesRouter.get(
  '/:incidentId/control-weaknesses/options',
  authenticate,
  validate({ params: controlWeaknessParamsSchema }),
  asyncHandler(getControlWeaknessOptions),
);

// Use case: Record Control Weakness from Incident -> recordControlWeakness.
controlWeaknessesRouter.post(
  '/:incidentId/control-weaknesses',
  authenticate,
  validate({ params: controlWeaknessParamsSchema, body: recordControlWeaknessBodySchema }),
  asyncHandler(recordControlWeakness),
);
