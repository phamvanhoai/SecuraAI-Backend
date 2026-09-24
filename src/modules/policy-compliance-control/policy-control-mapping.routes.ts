import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  frameworkControlsQuerySchema,
  frameworkParamsSchema,
  listPolicyControlMappingsQuerySchema,
  policyFrameworkMappingParamsSchema,
  replacePolicyControlMappingsBodySchema,
} from './dto/map-controls.dto.js';
import {
  listComplianceFrameworkControls,
  listComplianceFrameworks,
  listPolicyControlMappings,
  replacePolicyControlMappings,
} from './policy-control-mapping.controller.js';

export const policyControlMappingRouter = Router();

policyControlMappingRouter.get(
  '/policy-control-mappings',
  authenticate,
  authorize('compliance.map-controls'),
  validate({ query: listPolicyControlMappingsQuerySchema }),
  asyncHandler(listPolicyControlMappings),
);

policyControlMappingRouter.get(
  '/frameworks',
  authenticate,
  authorize('compliance.map-controls'),
  asyncHandler(listComplianceFrameworks),
);

policyControlMappingRouter.get(
  '/frameworks/:frameworkId/controls',
  authenticate,
  authorize('compliance.map-controls'),
  validate({ params: frameworkParamsSchema, query: frameworkControlsQuerySchema }),
  asyncHandler(listComplianceFrameworkControls),
);

policyControlMappingRouter.put(
  '/policies/:policyId/versions/:versionId/frameworks/:frameworkId/control-mappings',
  authenticate,
  authorize('compliance.map-controls'),
  validate({
    params: policyFrameworkMappingParamsSchema,
    body: replacePolicyControlMappingsBodySchema,
  }),
  asyncHandler(replacePolicyControlMappings),
);
