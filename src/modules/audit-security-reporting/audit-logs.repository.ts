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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildAuditLogsWhereClause(query: ListAuditLogsQuery): Prisma.audit_logsWhereInput {
  const andConditions: Prisma.audit_logsWhereInput[] = [];

  if (query.actorType) {
    andConditions.push({ actor_type: query.actorType });
  }

  if (query.action) {
    andConditions.push({ action: { contains: query.action, mode: 'insensitive' } });
  }

  if (query.resourceType) {
    andConditions.push({ resource_type: { contains: query.resourceType, mode: 'insensitive' } });
  }

  if (query.correlationId) {
    andConditions.push({ correlation_id: { contains: query.correlationId, mode: 'insensitive' } });
  }

  if (query.startDate || query.endDate) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (query.startDate) {
      dateFilter.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      dateFilter.lte = new Date(query.endDate);
    }
    andConditions.push({ occurred_at: dateFilter });
  }

  if (query.actor) {
    const actorOrConditions: Prisma.audit_logsWhereInput[] = [
      { users: { full_name: { contains: query.actor, mode: 'insensitive' } } },
      { users: { email: { contains: query.actor, mode: 'insensitive' } } },
      { integration_api_keys: { name: { contains: query.actor, mode: 'insensitive' } } },
    ];
    if (uuidPattern.test(query.actor)) {
      actorOrConditions.push({ actor_user_id: query.actor });
    }
    andConditions.push({ OR: actorOrConditions });
  }

  if (query.search) {
    const searchOrConditions: Prisma.audit_logsWhereInput[] = [
      { action: { contains: query.search, mode: 'insensitive' } },
      { resource_type: { contains: query.search, mode: 'insensitive' } },
      { correlation_id: { contains: query.search, mode: 'insensitive' } },
      { source_ip: { contains: query.search, mode: 'insensitive' } },
      { source: { contains: query.search, mode: 'insensitive' } },
      { users: { full_name: { contains: query.search, mode: 'insensitive' } } },
      { users: { email: { contains: query.search, mode: 'insensitive' } } },
    ];
    if (uuidPattern.test(query.search)) {
      searchOrConditions.push({ resource_id: query.search });
      searchOrConditions.push({ actor_user_id: query.search });
      searchOrConditions.push({ id: query.search });
    }
    andConditions.push({ OR: searchOrConditions });
  }

  if (andConditions.length === 0) {
    return {};
  }

  if (andConditions.length === 1 && andConditions[0]) {
    return andConditions[0];
  }

  return { AND: andConditions };
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
    const where = buildAuditLogsWhereClause(query);

    return prisma.audit_logs.findMany({
      where,
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

  count(query?: ListAuditLogsQuery) {
    const where = query ? buildAuditLogsWhereClause(query) : undefined;
    return where ? prisma.audit_logs.count({ where }) : prisma.audit_logs.count();
  },
};
