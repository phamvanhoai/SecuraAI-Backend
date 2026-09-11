import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createPolicyDraftSchema } from './dto/create-policy-draft.dto.js';
import {
  createPolicyDraft,
  getDraftPolicyVersion,
  listPublishablePolicies,
  publishPolicyVersion,
} from './policy-compliance.controller.js';
import { getPolicyVersionParamsSchema } from './dto/get-policy-version.dto.js';
import { listPublishablePoliciesQuerySchema } from './dto/list-publishable-policies.dto.js';
import {
  publishPolicyVersionBodySchema,
  publishPolicyVersionParamsSchema,
} from './dto/publish-policy-version.dto.js';

export const policyComplianceRouter = Router();

policyComplianceRouter.post(
  '/policies',
  authenticate,
  authorize('policies.create'),
  validate({ body: createPolicyDraftSchema }),
  asyncHandler(createPolicyDraft),
);

policyComplianceRouter.get(
  '/policies/drafts/reviewable',
  authenticate,
  authorize('policies.publish'),
  validate({ query: listPublishablePoliciesQuerySchema }),
  asyncHandler(listPublishablePolicies),
);

policyComplianceRouter.get(
  '/policies/:policyId/versions/:versionId/review',
  authenticate,
  authorize('policies.publish'),
  validate({ params: getPolicyVersionParamsSchema }),
  asyncHandler(getDraftPolicyVersion),
);

policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/publish',
  authenticate,
  authorize('policies.publish'),
  validate({ params: publishPolicyVersionParamsSchema, body: publishPolicyVersionBodySchema }),
  asyncHandler(publishPolicyVersion),
);
