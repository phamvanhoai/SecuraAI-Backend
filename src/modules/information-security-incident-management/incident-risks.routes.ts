import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getIncidentRiskOptions,
  linkIncidentRisk,
  unlinkIncidentRisk,
} from './incident-risks.controller.js';
import {
  incidentRiskLinkParamsSchema,
  incidentRiskOptionsQuerySchema,
  incidentRiskParamsSchema,
  linkIncidentRiskBodySchema,
} from './dto/link-incident-risk.dto.js';
export const incidentRisksRouter = Router();
incidentRisksRouter.get(
  '/:incidentId/risks/options',
  authenticate,
  validate({ params: incidentRiskParamsSchema, query: incidentRiskOptionsQuerySchema }),
  asyncHandler(getIncidentRiskOptions),
);
incidentRisksRouter.post(
  '/:incidentId/risks',
  authenticate,
  validate({ params: incidentRiskParamsSchema, body: linkIncidentRiskBodySchema }),
  asyncHandler(linkIncidentRisk),
);
incidentRisksRouter.delete(
  '/:incidentId/risks/:riskId',
  authenticate,
  validate({ params: incidentRiskLinkParamsSchema }),
  asyncHandler(unlinkIncidentRisk),
);
