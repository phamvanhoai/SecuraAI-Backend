import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getEventGovernancePolicyParamsSchema,
  listEventGovernancePoliciesQuerySchema,
} from './dto/event-governance-policy.dto.js';
import {
  getEventGovernanceLifecycleSummary,
  getEventGovernancePolicyDetail,
  listEventGovernancePolicies,
} from './event-governance.controller.js';

export const eventGovernanceRouter = Router();

eventGovernanceRouter.get(
  '/policies/summary',
  authenticate,
  asyncHandler(getEventGovernanceLifecycleSummary),
);

eventGovernanceRouter.get(
  '/policies/:id',
  authenticate,
  validate({ params: getEventGovernancePolicyParamsSchema }),
  asyncHandler(getEventGovernancePolicyDetail),
);

eventGovernanceRouter.get(
  '/policies',
  authenticate,
  validate({ query: listEventGovernancePoliciesQuerySchema }),
  asyncHandler(listEventGovernancePolicies),
);

eventGovernanceRouter.get(
  '/summary',
  authenticate,
  asyncHandler(getEventGovernanceLifecycleSummary),
);

eventGovernanceRouter.get(
  '/:id',
  authenticate,
  validate({ params: getEventGovernancePolicyParamsSchema }),
  asyncHandler(getEventGovernancePolicyDetail),
);

eventGovernanceRouter.get(
  '/',
  authenticate,
  validate({ query: listEventGovernancePoliciesQuerySchema }),
  asyncHandler(listEventGovernancePolicies),
);
