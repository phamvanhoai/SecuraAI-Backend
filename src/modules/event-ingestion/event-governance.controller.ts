import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { eventGovernanceService } from './event-governance.service.js';
import {
  getEventGovernancePolicyParamsSchema,
  listEventGovernancePoliciesQuerySchema,
} from './dto/event-governance-policy.dto.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return value;
}

export async function listEventGovernancePolicies(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const query = listEventGovernancePoliciesQuerySchema.parse(req.query);
  const result = await eventGovernanceService.listPolicies(userId, query);
  res.status(200).json({ success: true, data: result });
}

export async function getEventGovernancePolicyDetail(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getEventGovernancePolicyParamsSchema.parse(req.params);
  const result = await eventGovernanceService.getPolicyDetail(userId, params.id);
  res.status(200).json({ success: true, data: result });
}

export async function getEventGovernanceLifecycleSummary(
  _req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const result = await eventGovernanceService.getLifecycleSummary(userId);
  res.status(200).json({ success: true, data: result });
}
