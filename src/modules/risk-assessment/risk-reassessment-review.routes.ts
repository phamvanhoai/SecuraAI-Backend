import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  listOwnedRiskReassessmentRequests,
  startRiskReassessmentReview,
  completeRiskReassessment,
  rejectRiskReassessmentRequest,
} from './risk-reassessment-review.controller.js';
import {
  listOwnedReassessmentRequestsQuerySchema,
  reviewRiskReassessmentRequestParamsSchema,
  completeRiskReassessmentBodySchema,
  rejectRiskReassessmentRequestBodySchema,
} from './dto/review-risk-reassessment-request.dto.js';

export const riskReassessmentReviewRouter = Router();

// Use case: Review Risk Reassessment Request -> list the actor's requests.
riskReassessmentReviewRouter.get(
  '/reassessment-requests/mine',
  authenticate,
  validate({ query: listOwnedReassessmentRequestsQuerySchema }),
  asyncHandler(listOwnedRiskReassessmentRequests),
);

// Use case: Review Risk Reassessment Request -> startRiskReassessmentReview.
riskReassessmentReviewRouter.post(
  '/reassessment-requests/:requestId/review',
  authenticate,
  validate({ params: reviewRiskReassessmentRequestParamsSchema }),
  asyncHandler(startRiskReassessmentReview),
);

// Use case: Reassess Residual Risk -> completeRiskReassessment.
riskReassessmentReviewRouter.post(
  '/reassessment-requests/:requestId/complete',
  authenticate,
  validate({
    params: reviewRiskReassessmentRequestParamsSchema,
    body: completeRiskReassessmentBodySchema,
  }),
  asyncHandler(completeRiskReassessment),
);

// Use case: Review Risk Reassessment Request -> reject the request.
riskReassessmentReviewRouter.post(
  '/reassessment-requests/:requestId/reject',
  authenticate,
  validate({
    params: reviewRiskReassessmentRequestParamsSchema,
    body: rejectRiskReassessmentRequestBodySchema,
  }),
  asyncHandler(rejectRiskReassessmentRequest),
);
