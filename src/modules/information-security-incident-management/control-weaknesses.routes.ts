import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getControlWeaknessOptions,
  recordControlWeakness,
} from './control-weaknesses.controller.js';
import {
  controlWeaknessParamsSchema,
  recordControlWeaknessBodySchema,
} from './dto/record-control-weakness.dto.js';
export const controlWeaknessesRouter = Router();
controlWeaknessesRouter.get(
  '/:incidentId/control-weaknesses/options',
  authenticate,
  validate({ params: controlWeaknessParamsSchema }),
  asyncHandler(getControlWeaknessOptions),
);
controlWeaknessesRouter.post(
  '/:incidentId/control-weaknesses',
  authenticate,
  validate({ params: controlWeaknessParamsSchema, body: recordControlWeaknessBodySchema }),
  asyncHandler(recordControlWeakness),
);
