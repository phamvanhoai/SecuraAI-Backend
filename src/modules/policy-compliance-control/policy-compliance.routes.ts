import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getPolicyDraftReview,
  listOwnPolicyDrafts,
  listReviewablePolicyDrafts,
} from './policy-compliance.controller.js';
import {
  policyDraftReviewParamsSchema,
  reviewablePolicyDraftQuerySchema,
} from './dto/view-policy-draft.dto.js';
import { listPolicyDraftsQuerySchema } from './dto/list-policy-drafts.dto.js';

export const policyComplianceRouter = Router();
policyComplianceRouter.get(
  '/policies/drafts/mine',
  authenticate,
  validate({ query: listPolicyDraftsQuerySchema }),
  asyncHandler(listOwnPolicyDrafts),
);
policyComplianceRouter.get(
  '/policies/drafts/reviewable',
  authenticate,
  validate({ query: reviewablePolicyDraftQuerySchema }),
  asyncHandler(listReviewablePolicyDrafts),
);
policyComplianceRouter.get(
  '/policies/:policyId/versions/:versionId/review',
  authenticate,
  validate({ params: policyDraftReviewParamsSchema }),
  asyncHandler(getPolicyDraftReview),
);
