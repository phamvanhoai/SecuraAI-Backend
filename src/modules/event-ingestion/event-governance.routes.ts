import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizeRoles } from '../../common/middleware/authorize-roles.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getEventGovernancePolicyParamsSchema,
  listEventGovernancePoliciesQuerySchema,
  updateEventGovernancePolicySchema,
} from './dto/event-governance-policy.dto.js';
import { runRetentionPurgeBodySchema } from './dto/retention-purge.dto.js';
import {
  getEventGovernanceLifecycleSummary,
  getEventGovernancePolicyDetail,
  getRetentionPurgeStatus,
  listEventGovernancePolicies,
  runRetentionPurge,
  updateEventGovernancePolicy,
} from './event-governance.controller.js';

export const eventGovernanceRouter = Router();
// Apply authentication and admin role check for all routes
eventGovernanceRouter.use(authenticate, authorizeRoles('ADMIN'));
// Retention/Purge routes
eventGovernanceRouter.get(
  '/policies/retention-purge/status',
  authenticate,
  asyncHandler(getRetentionPurgeStatus),
);
// POST /api/v1/event-governance/policies/retention-purge/run
eventGovernanceRouter.post(
  '/policies/retention-purge/run',
  authenticate,
  validate({ body: runRetentionPurgeBodySchema }),
  asyncHandler(runRetentionPurge),
);
// GET /api/v1/event-governance/policies/summary
eventGovernanceRouter.get(
  '/policies/summary',
  authenticate,
  asyncHandler(getEventGovernanceLifecycleSummary),
);
// GET /api/v1/event-governance/policies/:id
eventGovernanceRouter.get(
  '/policies/:id',
  authenticate,
  validate({ params: getEventGovernancePolicyParamsSchema }),
  asyncHandler(getEventGovernancePolicyDetail),
);
// PATCH /api/v1/event-governance/policies/:id
eventGovernanceRouter.patch(
  '/policies/:id',
  authenticate,
  validate({
    params: getEventGovernancePolicyParamsSchema,
    body: updateEventGovernancePolicySchema,
  }),
  asyncHandler(updateEventGovernancePolicy),
);
// GET /api/v1/event-governance/policies
eventGovernanceRouter.get(
  '/policies',
  authenticate,
  validate({ query: listEventGovernancePoliciesQuerySchema }),
  asyncHandler(listEventGovernancePolicies),
);
// GET /api/v1/event-governance/retention-purge/status
eventGovernanceRouter.get(
  '/retention-purge/status',
  authenticate,
  asyncHandler(getRetentionPurgeStatus),
);
// POST /api/v1/event-governance/retention-purge/run
eventGovernanceRouter.post(
  '/retention-purge/run',
  authenticate,
  validate({ body: runRetentionPurgeBodySchema }),
  asyncHandler(runRetentionPurge),
);
// GET /api/v1/event-governance/summary
eventGovernanceRouter.get(
  '/summary',
  authenticate,
  asyncHandler(getEventGovernanceLifecycleSummary),
);
// GET /api/v1/event-governance/:id
eventGovernanceRouter.get(
  '/:id',
  authenticate,
  validate({ params: getEventGovernancePolicyParamsSchema }),
  asyncHandler(getEventGovernancePolicyDetail),
);
// PATCH /api/v1/event-governance/:id
eventGovernanceRouter.patch(
  '/:id',
  authenticate,
  validate({
    params: getEventGovernancePolicyParamsSchema,
    body: updateEventGovernancePolicySchema,
  }),
  asyncHandler(updateEventGovernancePolicy),
);
// GET /api/v1/event-governance/
eventGovernanceRouter.get(
  '/',
  authenticate,
  validate({ query: listEventGovernancePoliciesQuerySchema }),
  asyncHandler(listEventGovernancePolicies),
);
