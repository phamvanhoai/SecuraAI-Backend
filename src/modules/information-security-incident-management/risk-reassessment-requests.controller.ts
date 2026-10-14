import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  createRiskReassessmentRequestBodySchema,
  riskReassessmentRequestHistoryQuerySchema,
  riskReassessmentRequestParamsSchema,
} from './dto/create-risk-reassessment-request.dto.js';
import { riskReassessmentRequestsService } from './risk-reassessment-requests.service.js';

function userId(value: unknown) {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}

export const listRiskReassessmentRequestHistory: RequestHandler = async (req, res) => {
  const { incidentId } = riskReassessmentRequestParamsSchema.parse(req.params);
  res.status(200).json({
    success: true,
    data: await riskReassessmentRequestsService.history(
      userId(res.locals.authenticatedUserId),
      incidentId,
      riskReassessmentRequestHistoryQuerySchema.parse(req.query),
    ),
  });
};

export const getRiskReassessmentRequestOptions: RequestHandler = async (req, res) => {
  const { incidentId } = riskReassessmentRequestParamsSchema.parse(req.params);
  res.status(200).json({
    success: true,
    data: await riskReassessmentRequestsService.options(
      userId(res.locals.authenticatedUserId),
      incidentId,
    ),
  });
};

export const createRiskReassessmentRequest: RequestHandler = async (req, res) => {
  const { incidentId } = riskReassessmentRequestParamsSchema.parse(req.params);
  res.status(201).json({
    success: true,
    data: await riskReassessmentRequestsService.create(
      userId(res.locals.authenticatedUserId),
      incidentId,
      createRiskReassessmentRequestBodySchema.parse(req.body),
    ),
  });
};
