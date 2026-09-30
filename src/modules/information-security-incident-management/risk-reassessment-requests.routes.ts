import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createRiskReassessmentRequest,
  getRiskReassessmentRequestOptions,
} from './risk-reassessment-requests.controller.js';
import {
  createRiskReassessmentRequestBodySchema,
  riskReassessmentRequestParamsSchema,
} from './dto/create-risk-reassessment-request.dto.js';

export const riskReassessmentRequestsRouter = Router();
riskReassessmentRequestsRouter.get(
  '/:incidentId/risk-reassessment-requests/options',
  authenticate,
  validate({ params: riskReassessmentRequestParamsSchema }),
  asyncHandler(getRiskReassessmentRequestOptions),
);
riskReassessmentRequestsRouter.post(
  '/:incidentId/risk-reassessment-requests',
  authenticate,
  validate({
    params: riskReassessmentRequestParamsSchema,
    body: createRiskReassessmentRequestBodySchema,
  }),
  asyncHandler(createRiskReassessmentRequest),
);
