import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { getIncidentRiskOptions, linkIncidentRisk } from './incident-risks.controller.js';
import {
  incidentRiskParamsSchema,
  linkIncidentRiskBodySchema,
} from './dto/link-incident-risk.dto.js';
export const incidentRisksRouter = Router();
incidentRisksRouter.get(
  '/:incidentId/risks/options',
  authenticate,
  validate({ params: incidentRiskParamsSchema }),
  asyncHandler(getIncidentRiskOptions),
);
incidentRisksRouter.post(
  '/:incidentId/risks',
  authenticate,
  validate({ params: incidentRiskParamsSchema, body: linkIncidentRiskBodySchema }),
  asyncHandler(linkIncidentRisk),
);
