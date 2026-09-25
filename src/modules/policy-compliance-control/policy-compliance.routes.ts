import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { submitPolicyForReview } from './policy-compliance.controller.js';
import { submitPolicyForReviewParamsSchema } from './dto/submit-policy-for-review.dto.js';

export const policyComplianceRouter = Router();

policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/submit',
  authenticate,
  validate({ params: submitPolicyForReviewParamsSchema }),
  asyncHandler(submitPolicyForReview),
);
