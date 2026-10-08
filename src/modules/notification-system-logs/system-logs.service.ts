import { AppError } from '../../common/errors/app-error.js';
import type { SearchSystemLogsQuery } from './dto/search-system-logs.dto.js';
import { systemLogsRepository } from './system-logs.repository.js';

export const systemLogsService = {
  async search(actorUserId: string, query: SearchSystemLogsQuery) {
    const actor = await systemLogsRepository.findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Administrator or Security Officer access required');

    const result = await systemLogsRepository.search(query);
    return {
      items: result.items.map((record) => ({
        id: record.id,
        occurredAt: record.occurred_at.toISOString(),
        eventType: record.action,
        source: record.source ?? 'Application',
        actor:
          record.users?.full_name ??
          record.users?.email ??
          record.integration_api_keys?.name ??
          (record.actor_type === 'SYSTEM' ? 'System' : 'Unknown actor'),
        actorDetail: record.users?.email ?? null,
        status: record.outcome,
        resourceType: record.resource_type,
        correlationId: record.correlation_id,
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
