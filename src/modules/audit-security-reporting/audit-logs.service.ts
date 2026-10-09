import { AppError } from '../../common/errors/app-error.js';
import { auditLogsRepository } from './audit-logs.repository.js';
import type {
  AuditLogActorDto,
  AuditLogDiffDto,
  AuditLogItemDto,
  AuditLogListResponseDto,
  ListAuditLogsQuery,
} from './dto/list-audit-logs.dto.js';
import { computePropertyChanges } from './dto/list-audit-logs.dto.js';

type RawAuditRecord = Awaited<ReturnType<typeof auditLogsRepository.findMany>>[number];

function mapActor(record: RawAuditRecord): AuditLogActorDto | null {
  if (record.actor_type === 'USER' && record.users) {
    return {
      id: record.users.id,
      type: 'USER',
      name: record.users.full_name || record.users.email,
      email: record.users.email,
      role: record.users.role,
    };
  }

  if (record.actor_type === 'API_KEY' && record.integration_api_keys) {
    return {
      id: record.integration_api_keys.id,
      type: 'API_KEY',
      name: record.integration_api_keys.name,
      keyPrefix: record.integration_api_keys.key_prefix,
    };
  }

  if (record.actor_type === 'SYSTEM') {
    return {
      id: 'system',
      type: 'SYSTEM',
      name: 'System Engine',
    };
  }

  return null;
}

function mapAuditLogItem(record: RawAuditRecord): AuditLogItemDto {
  return {
    id: record.id,
    actorType: record.actor_type,
    actorUserId: record.actor_user_id,
    actorApiKeyId: record.actor_api_key_id,
    actor: mapActor(record),
    action: record.action,
    resourceType: record.resource_type,
    resourceId: record.resource_id,
    occurredAt: record.occurred_at.toISOString(),
    beforeData: (record.before_data as Record<string, unknown> | null) ?? null,
    afterData: (record.after_data as Record<string, unknown> | null) ?? null,
    correlationId: record.correlation_id,
    source: record.source,
    sourceIp: record.source_ip,
    userAgent: record.user_agent,
    previousHash: record.previous_hash,
    recordHash: record.record_hash,
    createdAt: record.created_at.toISOString(),
  };
}

async function requireAuditViewer(userId: string) {
  const actor = await auditLogsRepository.findActorUser(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or inactive user session');
  }

  if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER') {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Audit log access is restricted to Administrators and Security Officers',
    );
  }

  return actor;
}

export const auditLogsService = {
  async listAuditLogs(
    userId: string,
    query: ListAuditLogsQuery,
  ): Promise<AuditLogListResponseDto> {
    await requireAuditViewer(userId);

    const [records, totalItems] = await Promise.all([
      auditLogsRepository.findMany(query),
      auditLogsRepository.count(query),
    ]);

    const totalPages = Math.ceil(totalItems / query.limit) || 1;
    const items = records.map(mapAuditLogItem);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages,
      },
    };
  },

  async getAuditLogDetail(userId: string, id: string): Promise<AuditLogItemDto> {
    await requireAuditViewer(userId);

    const record = await auditLogsRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Audit log record not found');
    }

    return mapAuditLogItem(record);
  },

  async getAuditLogDiff(userId: string, id: string): Promise<AuditLogDiffDto> {
    await requireAuditViewer(userId);

    const record = await auditLogsRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Audit log record not found');
    }

    const beforeData = (record.before_data as Record<string, unknown> | null) ?? null;
    const afterData = (record.after_data as Record<string, unknown> | null) ?? null;
    const changes = computePropertyChanges(beforeData, afterData);

    const totalModified = changes.filter((c) => c.changeType === 'MODIFIED').length;
    const totalAdded = changes.filter((c) => c.changeType === 'ADDED').length;
    const totalRemoved = changes.filter((c) => c.changeType === 'REMOVED').length;
    const totalUnchanged = changes.filter((c) => c.changeType === 'UNCHANGED').length;

    return {
      id: record.id,
      action: record.action,
      resourceType: record.resource_type,
      resourceId: record.resource_id,
      occurredAt: record.occurred_at.toISOString(),
      totalProperties: changes.length,
      totalModified,
      totalAdded,
      totalRemoved,
      totalUnchanged,
      hasChanges: totalModified > 0 || totalAdded > 0 || totalRemoved > 0,
      changes,
    };
  },
};

