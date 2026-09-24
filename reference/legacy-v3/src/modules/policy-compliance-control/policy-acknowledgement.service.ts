import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import type { EmployeePolicyQuery } from './dto/acknowledge-policy.dto.js';
import { policyAcknowledgementRepository as repo } from './policy-acknowledgement.repository.js';
type Actor = { userId: string; permissions: readonly string[] };
type Context = { ipAddress: string | null; userAgent: string | null };
const requirePermission = (actor: Actor) => {
  if (!actor.permissions.includes('policies.acknowledge'))
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
};
const mapDetail = (v: NonNullable<Awaited<ReturnType<typeof repo.find>>>) => ({
  policyId: v.policies.policy_id,
  policyCode: v.policies.policy_code,
  title: v.policies.title,
  description: v.policies.description,
  version: {
    id: v.policy_version_id,
    versionNumber: v.version_number,
    content: v.content,
    changeSummary: v.change_summary,
    effectiveDate: v.effective_date?.toISOString() ?? null,
    publishedAt: v.published_at?.toISOString() ?? null,
  },
  acknowledgedAt: v.policy_acknowledgements[0]?.acknowledged_at.toISOString() ?? null,
});
export const policyAcknowledgementService = {
  async list(query: EmployeePolicyQuery, actor: Actor) {
    requirePermission(actor);
    const result = await repo.list(actor.userId, query);
    return {
      items: result.items.flatMap((p) => {
        const v = p.policy_versions[0];
        return v
          ? [
              {
                policyId: p.policy_id,
                policyCode: p.policy_code,
                title: p.title,
                description: p.description,
                versionId: v.policy_version_id,
                versionNumber: v.version_number,
                effectiveDate: v.effective_date?.toISOString() ?? null,
                publishedAt: v.published_at?.toISOString() ?? null,
                acknowledgedAt: v.policy_acknowledgements[0]?.acknowledged_at.toISOString() ?? null,
              },
            ]
          : [];
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async detail(policyId: string, versionId: string, actor: Actor) {
    requirePermission(actor);
    const v = await repo.find(prisma, actor.userId, policyId, versionId);
    if (!v) throw new AppError(404, 'EMPLOYEE_POLICY_NOT_FOUND', 'Applicable policy was not found');
    return mapDetail(v);
  },
  async acknowledge(policyId: string, versionId: string, actor: Actor, context: Context) {
    requirePermission(actor);
    return repo.transaction(async (db) => {
      const v = await repo.find(db, actor.userId, policyId, versionId);
      if (!v)
        throw new AppError(404, 'EMPLOYEE_POLICY_NOT_FOUND', 'Applicable policy was not found');
      const existing = v.policy_acknowledgements[0];
      if (existing)
        return {
          policyId,
          versionId,
          acknowledgedAt: existing.acknowledged_at.toISOString(),
          alreadyAcknowledged: true,
        };
      const created = await repo.create(db, actor.userId, versionId, context.ipAddress);
      await repo.audit(db, {
        userId: actor.userId,
        policyId,
        versionId,
        at: created.acknowledged_at,
        ...context,
      });
      return {
        policyId,
        versionId,
        acknowledgedAt: created.acknowledged_at.toISOString(),
        alreadyAcknowledged: false,
      };
    });
  },
};
