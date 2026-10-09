import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAuditLogsQuery } from './dto/list-audit-logs.dto.js';

function mapSortColumn(
  sortBy: ListAuditLogsQuery['sortBy'],
): keyof Prisma.audit_logsOrderByWithRelationInput {
  switch (sortBy) {
    case 'action':
      return 'action';
    case 'resourceType':
      return 'resource_type';
    case 'actorType':
      return 'actor_type';
    case 'sourceIp':
      return 'source_ip';
    case 'createdAt':
      return 'created_at';
    case 'occurredAt':
    default:
      return 'occurred_at';
  }
}

export const auditLogsRepository = {
  findActorUser(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, full_name: true, email: true, role: true, status: true },
    });
  },

  async findMany(query: ListAuditLogsQuery) {
    const sortField = mapSortColumn(query.sortBy);
    const skip = (query.page - 1) * query.limit;

    return prisma.audit_logs.findMany({
      orderBy: { [sortField]: query.sortOrder },
      skip,
      take: query.limit,
      select: {
        id: true,
        actor_type: true,
        actor_user_id: true,
        actor_api_key_id: true,
        action: true,
        resource_type: true,
        resource_id: true,
        occurred_at: true,
        before_data: true,
        after_data: true,
        correlation_id: true,
        source: true,
        source_ip: true,
        user_agent: true,
        previous_hash: true,
        record_hash: true,
        created_at: true,
        users: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true,
          },
        },
        integration_api_keys: {
          select: {
            id: true,
            name: true,
            key_prefix: true,
          },
        },
      },
    });
  },

  count() {
    return prisma.audit_logs.count();
  },
};
