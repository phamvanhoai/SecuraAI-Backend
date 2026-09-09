import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { publishPolicyVersion } from './policy-compliance.controller.js';
import {
  publishPolicyVersionBodySchema,
  publishPolicyVersionParamsSchema,
} from './dto/publish-policy-version.dto.js';

export const policyComplianceRouter = Router();

policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/publish',
  authenticate,
  authorize('policies.publish'),
  validate({ params: publishPolicyVersionParamsSchema, body: publishPolicyVersionBodySchema }),
  asyncHandler(publishPolicyVersion),
);
