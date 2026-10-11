import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  listOwnedReassessmentRequestsQuerySchema,
  reviewRiskReassessmentRequestParamsSchema,
  completeRiskReassessmentBodySchema,
  rejectRiskReassessmentRequestBodySchema,
} from './dto/review-risk-reassessment-request.dto.js';
import { riskReassessmentReviewService } from './risk-reassessment-review.service.js';

function userId(value: unknown) {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}

export const listOwnedRiskReassessmentRequests: RequestHandler = async (req, res) => {
  res.status(200).json({
    success: true,
    data: await riskReassessmentReviewService.listOwned(
      userId(res.locals.authenticatedUserId),
      listOwnedReassessmentRequestsQuerySchema.parse(req.query),
    ),
  });
};

export const startRiskReassessmentReview: RequestHandler = async (req, res) => {
  const { requestId } = reviewRiskReassessmentRequestParamsSchema.parse(req.params);
  res.status(200).json({
    success: true,
    data: await riskReassessmentReviewService.startReview(
      userId(res.locals.authenticatedUserId),
      requestId,
    ),
  });
};
export const completeRiskReassessment: RequestHandler = async (req, res) => {
  const { requestId } = reviewRiskReassessmentRequestParamsSchema.parse(req.params);
  res
    .status(200)
    .json({
      success: true,
      data: await riskReassessmentReviewService.complete(
        userId(res.locals.authenticatedUserId),
        requestId,
        completeRiskReassessmentBodySchema.parse(req.body),
      ),
    });
};
export const rejectRiskReassessmentRequest: RequestHandler = async (req, res) => {
  const { requestId } = reviewRiskReassessmentRequestParamsSchema.parse(req.params);
  res.status(200).json({
    success: true,
    data: await riskReassessmentReviewService.reject(
      userId(res.locals.authenticatedUserId),
      requestId,
      rejectRiskReassessmentRequestBodySchema.parse(req.body),
    ),
  });
};
