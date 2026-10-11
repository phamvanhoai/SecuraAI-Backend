import { prisma } from '../../database/prisma.js';
import type { Prisma } from '@prisma/client';
import type { ListIntegrationApiKeysQueryDto } from './dto/list-integration-api-keys.dto.js';

export const integrationApiKeysRepository = {
  async findMany(query: ListIntegrationApiKeysQueryDto) {
    const where = buildWhereClause(query);
    const skip = (query.page - 1) * query.limit;
    const take = query.limit;

    const orderBy: Prisma.integration_api_keysOrderByWithRelationInput = {
      [query.sortBy === 'name' ? 'name' : query.sortBy === 'expiresAt' ? 'expires_at' : query.sortBy === 'lastUsedAt' ? 'last_used_at' : 'created_at']:
        query.sortOrder,
    };

    return prisma.integration_api_keys.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        event_source_id: true,
        name: true,
        key_prefix: true,
        status: true,
        expires_at: true,
        last_used_at: true,
        last_used_ip: true,
        created_by: true,
        created_at: true,
        rotated_at: true,
        revoked_by: true,
        revoked_at: true,
        replacement_key_id: true,
        api_key_scopes: {
          select: {
            id: true,
            scope_code: true,
            created_at: true,
          },
          orderBy: {
            scope_code: 'asc',
          },
        },
        users_integration_api_keys_created_byTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            username: true,
          },
        },
        event_sources: {
          select: {
            id: true,
            name: true,
            source_type: true,
          },
        },
      },
    });
  },

  async count(query: ListIntegrationApiKeysQueryDto) {
    const where = buildWhereClause(query);
    return prisma.integration_api_keys.count({ where });
  },

  async findById(id: string) {
    return prisma.integration_api_keys.findUnique({
      where: { id },
      select: {
        id: true,
        event_source_id: true,
        name: true,
        key_prefix: true,
        status: true,
        expires_at: true,
        last_used_at: true,
        last_used_ip: true,
        created_by: true,
        created_at: true,
        rotated_at: true,
        revoked_by: true,
        revoked_at: true,
        replacement_key_id: true,
        api_key_scopes: {
          select: {
            id: true,
            scope_code: true,
            created_at: true,
          },
          orderBy: {
            scope_code: 'asc',
          },
        },
        users_integration_api_keys_created_byTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            username: true,
          },
        },
        event_sources: {
          select: {
            id: true,
            name: true,
            source_type: true,
          },
        },
      },
    });
  },

  async findEventSourceById(id: string) {
    return prisma.event_sources.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
  },

  async findUserById(id: string) {
    return prisma.users.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });
  },
};

function buildWhereClause(
  query: ListIntegrationApiKeysQueryDto,
): Prisma.integration_api_keysWhereInput {
  const where: Prisma.integration_api_keysWhereInput = {};
  const targetSourceId = query.eventSourceId || query.integrationId;

  if (targetSourceId) {
    where.event_source_id = targetSourceId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.isActive !== undefined) {
    if (query.isActive) {
      where.status = 'ACTIVE';
      where.OR = [
        { expires_at: null },
        { expires_at: { gt: new Date() } },
      ];
    } else {
      where.OR = [
        { status: { not: 'ACTIVE' } },
        {
          AND: [
            { status: 'ACTIVE' },
            { expires_at: { lte: new Date() } },
          ],
        },
      ];
    }
  }

  if (query.search) {
    const term = query.search;
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { key_prefix: { contains: term, mode: 'insensitive' } },
          {
            api_key_scopes: {
              some: {
                scope_code: { contains: term, mode: 'insensitive' },
              },
            },
          },
        ],
      },
    ];
  }

  return where;
}
