import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import type { SubmitPolicyForReviewParams } from './dto/submit-policy-for-review.dto.js';
import { policyComplianceService } from './policy-compliance.service.js';

export const submitPolicyForReview: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId, versionId } = req.params as SubmitPolicyForReviewParams;
  const data = await policyComplianceService.submitForReview(userId, policyId, versionId);
  res.status(200).json({ success: true, data });
};
