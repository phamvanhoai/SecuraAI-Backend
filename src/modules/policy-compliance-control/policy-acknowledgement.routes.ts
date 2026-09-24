import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import {
  employeePolicyQuerySchema,
  policyAcknowledgementParamsSchema,
} from './dto/acknowledge-policy.dto.js';
import { policyComplianceController } from './policy-compliance.controller.js';
export const policyAcknowledgementRouter = Router();
policyAcknowledgementRouter.get(
  '/policies/acknowledgements/mine',
  authenticate,
  authorize('policies.acknowledge'),
  validate({ query: employeePolicyQuerySchema }),
  policyComplianceController.listMyPolicyAcknowledgements,
);
policyAcknowledgementRouter.get(
  '/policies/:policyId/versions/:versionId/acknowledgement',
  authenticate,
  authorize('policies.acknowledge'),
  validate({ params: policyAcknowledgementParamsSchema }),
  policyComplianceController.getMyPolicyAcknowledgement,
);
policyAcknowledgementRouter.post(
  '/policies/:policyId/versions/:versionId/acknowledgements',
  authenticate,
  authorize('policies.acknowledge'),
  validate({ params: policyAcknowledgementParamsSchema }),
  policyComplianceController.acknowledgePolicyVersion,
);
