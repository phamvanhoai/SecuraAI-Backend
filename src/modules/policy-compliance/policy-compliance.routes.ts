import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createPolicyDraftSchema } from './dto/create-policy-draft.dto.js';
import {
  createPolicyDraft,
  getOwnPolicyDraft,
  listOwnPolicyDrafts,
  publishPolicyVersion,
  updateOwnPolicyDraft,
} from './policy-compliance.controller.js';
import {
  listOwnPolicyDraftsQuerySchema,
  policyDraftParamsSchema,
  updatePolicyDraftSchema,
} from './dto/manage-policy-draft.dto.js';
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
  '/policies/drafts/mine',
  authenticate,
  authorize('policies.create'),
  validate({ query: listOwnPolicyDraftsQuerySchema }),
  asyncHandler(listOwnPolicyDrafts),
);

policyComplianceRouter.get(
  '/policies/:policyId/drafts/:versionId',
  authenticate,
  authorize('policies.create'),
  validate({ params: policyDraftParamsSchema }),
  asyncHandler(getOwnPolicyDraft),
);

policyComplianceRouter.patch(
  '/policies/:policyId/drafts/:versionId',
  authenticate,
  authorize('policies.create'),
  validate({ params: policyDraftParamsSchema, body: updatePolicyDraftSchema }),
  asyncHandler(updateOwnPolicyDraft),
);

policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/publish',
  authenticate,
  authorize('policies.publish'),
  validate({ params: publishPolicyVersionParamsSchema, body: publishPolicyVersionBodySchema }),
  asyncHandler(publishPolicyVersion),
);
