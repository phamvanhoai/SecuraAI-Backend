import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { listOwnPolicyDrafts } from './policy-compliance.controller.js';
import { listPolicyDraftsQuerySchema } from './dto/list-policy-drafts.dto.js';

export const policyComplianceRouter = Router();

policyComplianceRouter.get(
  '/policies/drafts/mine',
  authenticate,
  validate({ query: listPolicyDraftsQuerySchema }),
  asyncHandler(listOwnPolicyDrafts),
);
