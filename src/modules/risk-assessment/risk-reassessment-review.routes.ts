import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  listOwnedRiskReassessmentRequests,
  startRiskReassessmentReview,
  completeRiskReassessment,
} from './risk-reassessment-review.controller.js';
import {
  listOwnedReassessmentRequestsQuerySchema,
  reviewRiskReassessmentRequestParamsSchema,
  completeRiskReassessmentBodySchema,
} from './dto/review-risk-reassessment-request.dto.js';

export const riskReassessmentReviewRouter = Router();
riskReassessmentReviewRouter.get(
  '/reassessment-requests/mine',
  authenticate,
  validate({ query: listOwnedReassessmentRequestsQuerySchema }),
  asyncHandler(listOwnedRiskReassessmentRequests),
);
riskReassessmentReviewRouter.post(
  '/reassessment-requests/:requestId/review',
  authenticate,
  validate({ params: reviewRiskReassessmentRequestParamsSchema }),
  asyncHandler(startRiskReassessmentReview),
);
riskReassessmentReviewRouter.post('/reassessment-requests/:requestId/complete', authenticate, validate({ params: reviewRiskReassessmentRequestParamsSchema, body: completeRiskReassessmentBodySchema }), asyncHandler(completeRiskReassessment));
