import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { eventGovernanceService } from './event-governance.service.js';
import { eventRetentionPurgeService } from './event-retention-purge.service.js';
import { isAutomatedRetentionPurgeWorkerActive } from './event-retention-purge.worker.js';
import {
  getEventGovernancePolicyParamsSchema,
  listEventGovernancePoliciesQuerySchema,
  updateEventGovernancePolicySchema,
} from './dto/event-governance-policy.dto.js';
import { runRetentionPurgeBodySchema } from './dto/retention-purge.dto.js';
// Extract user ID from authentication
function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return value;
}
// GET /api/v1/event-governance/
export async function listEventGovernancePolicies(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const query = listEventGovernancePoliciesQuerySchema.parse(req.query);
  const result = await eventGovernanceService.listPolicies(userId, query);
  res.status(200).json({ success: true, data: result });
}
// GET /api/v1/event-governance/:id
export async function getEventGovernancePolicyDetail(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getEventGovernancePolicyParamsSchema.parse(req.params);
  const result = await eventGovernanceService.getPolicyDetail(userId, params.id);
  res.status(200).json({ success: true, data: result });
}
// PATCH /api/v1/event-governance/:id
export async function updateEventGovernancePolicy(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getEventGovernancePolicyParamsSchema.parse(req.params);
  const body = updateEventGovernancePolicySchema.parse(req.body);
  const result = await eventGovernanceService.updatePolicy(userId, params.id, body);
  res.status(200).json({ success: true, data: result });
}
// GET /api/v1/event-governance/summary
export async function getEventGovernanceLifecycleSummary(
  _req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const result = await eventGovernanceService.getLifecycleSummary(userId);
  res.status(200).json({ success: true, data: result });
}
// GET /api/v1/event-governance/retention-purge/status
export async function getRetentionPurgeStatus(_req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const result = await eventRetentionPurgeService.getStatus(
    userId,
    isAutomatedRetentionPurgeWorkerActive(),
  );
  res.status(200).json({ success: true, data: result });
}
// POST /api/v1/event-governance/retention-purge/run
export async function runRetentionPurge(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const body = runRetentionPurgeBodySchema.parse(req.body ?? {});
  const result = await eventRetentionPurgeService.runManual(userId, body);
  res.status(200).json({ success: true, data: result });
}
