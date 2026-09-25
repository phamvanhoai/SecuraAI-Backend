import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  policyDraftReviewParamsSchema,
  reviewablePolicyDraftQuerySchema,
} from './dto/view-policy-draft.dto.js';
import { policyComplianceService } from './policy-compliance.service.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}

export const listReviewablePolicyDrafts: RequestHandler = async (req, res) => {
  const data = await policyComplianceService.listReviewableDrafts(
    authenticatedUserId(res.locals.authenticatedUserId),
    reviewablePolicyDraftQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const getPolicyDraftReview: RequestHandler = async (req, res) => {
  const { policyId, versionId } = policyDraftReviewParamsSchema.parse(req.params);
  const data = await policyComplianceService.getReviewableDraft(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};
