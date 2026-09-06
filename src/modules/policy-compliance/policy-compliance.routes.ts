import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createPolicyDraftSchema } from './dto/create-policy-draft.dto.js';
import { createPolicyDraft } from './policy-compliance.controller.js';

export const policyComplianceRouter = Router();

policyComplianceRouter.post(
  '/policies',
  authenticate,
  authorize('policies:create'),
  validate({ body: createPolicyDraftSchema }),
  asyncHandler(createPolicyDraft),
);
