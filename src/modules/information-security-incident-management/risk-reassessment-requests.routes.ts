import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createRiskReassessmentRequest,
  getRiskReassessmentRequestOptions,
  listRiskReassessmentRequestHistory,
} from './risk-reassessment-requests.controller.js';
import {
  createRiskReassessmentRequestBodySchema,
  riskReassessmentRequestParamsSchema,
  riskReassessmentRequestHistoryQuerySchema,
} from './dto/create-risk-reassessment-request.dto.js';

export const riskReassessmentRequestsRouter = Router();

// Supporting route: view requests already created from the incident.
riskReassessmentRequestsRouter.get(
  '/:incidentId/risk-reassessment-requests',
  authenticate,
  validate({
    params: riskReassessmentRequestParamsSchema,
    query: riskReassessmentRequestHistoryQuerySchema,
  }),
  asyncHandler(listRiskReassessmentRequestHistory),
);

// Supporting route: load risks and findings allowed by the current code.
riskReassessmentRequestsRouter.get(
  '/:incidentId/risk-reassessment-requests/options',
  authenticate,
  validate({ params: riskReassessmentRequestParamsSchema }),
  asyncHandler(getRiskReassessmentRequestOptions),
);

// Use case: Create Risk Reassessment Request -> createRiskReassessmentRequest.
riskReassessmentRequestsRouter.post(
  '/:incidentId/risk-reassessment-requests',
  authenticate,
  validate({
    params: riskReassessmentRequestParamsSchema,
    body: createRiskReassessmentRequestBodySchema,
  }),
  asyncHandler(createRiskReassessmentRequest),
);
