import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getPolicyDraftReview,
  listOwnPolicyDrafts,
  submitPolicyForReview,
  listReviewablePolicyDrafts,
  editPolicyDraft,
  requestPolicyRevision,
} from './policy-compliance.controller.js';
import {
  policyDraftReviewParamsSchema,
  reviewablePolicyDraftQuerySchema,
} from './dto/view-policy-draft.dto.js';
import { listPolicyDraftsQuerySchema } from './dto/list-policy-drafts.dto.js';
import { submitPolicyForReviewParamsSchema } from './dto/submit-policy-for-review.dto.js';
import {
  editPolicyDraftBodySchema,
  editPolicyDraftParamsSchema,
} from './dto/edit-policy-draft.dto.js';
import {
  requestPolicyRevisionBodySchema,
  requestPolicyRevisionParamsSchema,
} from './dto/request-policy-revision.dto.js';

export const policyComplianceRouter = Router();
policyComplianceRouter.patch(
  '/policies/:policyId/drafts/:versionId',
  authenticate,
  validate({ params: editPolicyDraftParamsSchema, body: editPolicyDraftBodySchema }),
  asyncHandler(editPolicyDraft),
);
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/revision-requests',
  authenticate,
  validate({ params: requestPolicyRevisionParamsSchema, body: requestPolicyRevisionBodySchema }),
  asyncHandler(requestPolicyRevision),
);
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/submit',
  authenticate,
  validate({ params: submitPolicyForReviewParamsSchema }),
  asyncHandler(submitPolicyForReview),
);
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
