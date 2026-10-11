import { AppError } from '../../common/errors/app-error.js';
import type { ListUserActivityAuditQuery } from './dto/list-user-activity-audit.dto.js';
import { userActivityAuditRepository } from './user-activity-audit.repository.js';

export const userActivityAuditService = {
  async list(actorUserId: string, query: ListUserActivityAuditQuery) {
    const actor = await userActivityAuditRepository.findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'ADMIN')
      throw new AppError(403, 'FORBIDDEN', 'Administrator access required');

    const result = await userActivityAuditRepository.list(query);
    return {
      items: result.items.map((record) => ({
        id: record.id,
        actor: {
          id: record.users?.id ?? null,
          name: record.users?.full_name ?? 'Unknown user',
          email: record.users?.email ?? null,
        },
        action: record.action,
        resource: { type: record.resource_type, id: record.resource_id },
        occurredAt: record.occurred_at.toISOString(),
        outcome: record.outcome,
        source: record.source,
        sourceIp: record.source_ip,
        errorCode: record.error_code,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pageCount: Math.max(1, Math.ceil(result.total / query.limit)),
      },
    };
  },
};
