import { createHash } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { Prisma, api_key_status } from '@prisma/client';
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
        users_integration_api_keys_revoked_byTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            username: true,
          },
        },
        integration_api_keys: {
          select: {
            id: true,
            name: true,
            key_prefix: true,
            status: true,
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

  async countAuditLogsForApiKey(apiKeyId: string) {
    return prisma.audit_logs.count({
      where: {
        actor_api_key_id: apiKeyId,
      },
    });
  },

  async findEventSourceById(id: string) {
    return prisma.event_sources.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
  },

  async findByPrefix(keyPrefix: string) {
    return prisma.integration_api_keys.findUnique({
      where: { key_prefix: keyPrefix },
      select: { id: true },
    });
  },

  async createApiKey(data: {
    name: string;
    eventSourceId: string | null;
    keyPrefix: string;
    secretHash: string;
    status: api_key_status;
    expiresAt: Date | null;
    createdBy: string;
    scopes: string[];
  }) {
    return prisma.$transaction(async (tx) => {
      const createdKey = await tx.integration_api_keys.create({
        data: {
          name: data.name,
          event_source_id: data.eventSourceId,
          key_prefix: data.keyPrefix,
          secret_hash: data.secretHash,
          status: data.status,
          expires_at: data.expiresAt,
          created_by: data.createdBy,
        },
      });

      if (data.scopes.length > 0) {
        await tx.api_key_scopes.createMany({
          data: data.scopes.map((scopeCode) => ({
            api_key_id: createdKey.id,
            scope_code: scopeCode,
          })),
        });
      }

      const previous = await tx.audit_logs.findFirst({
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        select: { record_hash: true },
      });

      const recordHash = createHash('sha256')
        .update(
          JSON.stringify({
            previousHash: previous?.record_hash ?? null,
            actorUserId: data.createdBy,
            apiKeyId: createdKey.id,
            name: data.name,
            keyPrefix: data.keyPrefix,
            scopes: data.scopes,
            expiresAt: data.expiresAt?.toISOString() ?? null,
          }),
        )
        .digest('hex');

      await tx.audit_logs.create({
        data: {
          actor_user_id: data.createdBy,
          actor_type: 'USER',
          action: 'CREATE_INTEGRATION_API_KEY',
          resource_type: 'INTEGRATION_API_KEY',
          resource_id: createdKey.id,
          source: 'API',
          after_data: {
            id: createdKey.id,
            name: data.name,
            key_prefix: data.keyPrefix,
            event_source_id: data.eventSourceId,
            scopes: data.scopes,
            expires_at: data.expiresAt?.toISOString() ?? null,
            status: data.status,
          },
          ...(previous ? { previous_hash: previous.record_hash } : {}),
          record_hash: recordHash,
        },
      });

      return tx.integration_api_keys.findUniqueOrThrow({
        where: { id: createdKey.id },
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
    });
  },

  async updateApiKey(
    id: string,
    data: {
      name?: string | undefined;
      expiresAt?: Date | null | undefined;
      status?: api_key_status | undefined;
      scopes?: string[] | undefined;
      updatedBy: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.integration_api_keys.findUniqueOrThrow({
        where: { id },
        include: {
          api_key_scopes: true,
        },
      });

      const updateData: Prisma.integration_api_keysUpdateInput = {};
      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.expiresAt !== undefined) {
        updateData.expires_at = data.expiresAt;
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }

      const updatedKey = await tx.integration_api_keys.update({
        where: { id },
        data: updateData,
      });

      if (data.scopes !== undefined) {
        await tx.api_key_scopes.deleteMany({
          where: { api_key_id: id },
        });

        if (data.scopes.length > 0) {
          await tx.api_key_scopes.createMany({
            data: data.scopes.map((scopeCode) => ({
              api_key_id: id,
              scope_code: scopeCode,
            })),
          });
        }
      }

      const previous = await tx.audit_logs.findFirst({
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        select: { record_hash: true },
      });

      const beforeData = {
        name: existing.name,
        expires_at: existing.expires_at?.toISOString() ?? null,
        status: existing.status,
        scopes: existing.api_key_scopes.map((s) => s.scope_code),
      };

      const afterData = {
        name: data.name ?? existing.name,
        expires_at:
          data.expiresAt !== undefined
            ? (data.expiresAt?.toISOString() ?? null)
            : (existing.expires_at?.toISOString() ?? null),
        status: data.status ?? existing.status,
        scopes: data.scopes ?? existing.api_key_scopes.map((s) => s.scope_code),
      };

      const recordHash = createHash('sha256')
        .update(
          JSON.stringify({
            previousHash: previous?.record_hash ?? null,
            actorUserId: data.updatedBy,
            apiKeyId: id,
            action: 'UPDATE_INTEGRATION_API_KEY',
            beforeData,
            afterData,
          }),
        )
        .digest('hex');

      await tx.audit_logs.create({
        data: {
          actor_user_id: data.updatedBy,
          actor_type: 'USER',
          action: 'UPDATE_INTEGRATION_API_KEY',
          resource_type: 'INTEGRATION_API_KEY',
          resource_id: id,
          source: 'API',
          before_data: beforeData,
          after_data: afterData,
          ...(previous ? { previous_hash: previous.record_hash } : {}),
          record_hash: recordHash,
        },
      });

      return tx.integration_api_keys.findUniqueOrThrow({
        where: { id: updatedKey.id },
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
    });
  },

  async rotateApiKey(data: {
    existingKeyId: string;
    name: string;
    eventSourceId: string | null;
    keyPrefix: string;
    secretHash: string;
    status: api_key_status;
    expiresAt: Date | null;
    rotatedBy: string;
    scopes: string[];
  }) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.integration_api_keys.findUniqueOrThrow({
        where: { id: data.existingKeyId },
        include: {
          api_key_scopes: true,
        },
      });

      const replacementKey = await tx.integration_api_keys.create({
        data: {
          name: data.name,
          event_source_id: data.eventSourceId,
          key_prefix: data.keyPrefix,
          secret_hash: data.secretHash,
          status: data.status,
          expires_at: data.expiresAt,
          created_by: data.rotatedBy,
        },
      });

      if (data.scopes.length > 0) {
        await tx.api_key_scopes.createMany({
          data: data.scopes.map((scopeCode) => ({
            api_key_id: replacementKey.id,
            scope_code: scopeCode,
          })),
        });
      }

      const rotatedAt = new Date();
      await tx.integration_api_keys.update({
        where: { id: data.existingKeyId },
        data: {
          status: 'ROTATED',
          rotated_at: rotatedAt,
          replacement_key_id: replacementKey.id,
        },
      });

      const previous = await tx.audit_logs.findFirst({
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        select: { record_hash: true },
      });

      const beforeData = {
        id: existing.id,
        name: existing.name,
        status: existing.status,
        key_prefix: existing.key_prefix,
        replacement_key_id: existing.replacement_key_id,
      };

      const afterData = {
        id: existing.id,
        name: existing.name,
        status: 'ROTATED',
        key_prefix: existing.key_prefix,
        replacement_key_id: replacementKey.id,
        replacement_key_prefix: replacementKey.key_prefix,
        rotated_at: rotatedAt.toISOString(),
      };

      const recordHash = createHash('sha256')
        .update(
          JSON.stringify({
            previousHash: previous?.record_hash ?? null,
            actorUserId: data.rotatedBy,
            apiKeyId: data.existingKeyId,
            action: 'ROTATE_INTEGRATION_API_KEY',
            replacementKeyId: replacementKey.id,
            beforeData,
            afterData,
          }),
        )
        .digest('hex');

      await tx.audit_logs.create({
        data: {
          actor_user_id: data.rotatedBy,
          actor_type: 'USER',
          action: 'ROTATE_INTEGRATION_API_KEY',
          resource_type: 'INTEGRATION_API_KEY',
          resource_id: data.existingKeyId,
          source: 'API',
          before_data: beforeData,
          after_data: afterData,
          ...(previous ? { previous_hash: previous.record_hash } : {}),
          record_hash: recordHash,
        },
      });

      return tx.integration_api_keys.findUniqueOrThrow({
        where: { id: replacementKey.id },
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
    });
  },

  async revokeApiKey(id: string, revokedBy: string, reason?: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.integration_api_keys.findUniqueOrThrow({
        where: { id },
        include: {
          api_key_scopes: true,
        },
      });

      const revokedAt = new Date();
      const updatedKey = await tx.integration_api_keys.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revoked_by: revokedBy,
          revoked_at: revokedAt,
        },
      });

      const previous = await tx.audit_logs.findFirst({
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        select: { record_hash: true },
      });

      const beforeData = {
        id: existing.id,
        name: existing.name,
        status: existing.status,
        key_prefix: existing.key_prefix,
        revoked_by: existing.revoked_by,
        revoked_at: existing.revoked_at?.toISOString() ?? null,
      };

      const afterData = {
        id: existing.id,
        name: existing.name,
        status: 'REVOKED',
        key_prefix: existing.key_prefix,
        revoked_by: revokedBy,
        revoked_at: revokedAt.toISOString(),
        ...(reason ? { reason } : {}),
      };

      const recordHash = createHash('sha256')
        .update(
          JSON.stringify({
            previousHash: previous?.record_hash ?? null,
            actorUserId: revokedBy,
            apiKeyId: id,
            action: 'REVOKE_INTEGRATION_API_KEY',
            beforeData,
            afterData,
          }),
        )
        .digest('hex');

      await tx.audit_logs.create({
        data: {
          actor_user_id: revokedBy,
          actor_type: 'USER',
          action: 'REVOKE_INTEGRATION_API_KEY',
          resource_type: 'INTEGRATION_API_KEY',
          resource_id: id,
          source: 'API',
          before_data: beforeData,
          after_data: afterData,
          ...(previous ? { previous_hash: previous.record_hash } : {}),
          record_hash: recordHash,
        },
      });

      return tx.integration_api_keys.findUniqueOrThrow({
        where: { id: updatedKey.id },
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
  const andClauses: Prisma.integration_api_keysWhereInput[] = [];
  const targetSourceId = query.eventSourceId || query.integrationId;

  if (targetSourceId) {
    andClauses.push({ event_source_id: targetSourceId });
  }

  if (query.status) {
    andClauses.push({ status: query.status });
  }

  if (query.scope) {
    andClauses.push({
      api_key_scopes: {
        some: {
          scope_code: { contains: query.scope, mode: 'insensitive' },
        },
      },
    });
  }

  if (query.creator) {
    const creatorTerm = query.creator;
    andClauses.push({
      users_integration_api_keys_created_byTousers: {
        OR: [
          { full_name: { contains: creatorTerm, mode: 'insensitive' } },
          { email: { contains: creatorTerm, mode: 'insensitive' } },
          { username: { contains: creatorTerm, mode: 'insensitive' } },
        ],
      },
    });
  }

  const now = new Date();
  if (query.expirationPeriod) {
    if (query.expirationPeriod === 'expired') {
      andClauses.push({ expires_at: { lte: now } });
    } else if (query.expirationPeriod === 'expiring_soon') {
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      andClauses.push({
        expires_at: {
          gt: now,
          lte: in30Days,
        },
      });
    } else if (query.expirationPeriod === 'never') {
      andClauses.push({ expires_at: null });
    } else if (query.expirationPeriod === 'active') {
      andClauses.push({
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      });
    }
  }

  if (query.expiresFrom || query.expiresTo) {
    const dateFilter: Prisma.DateTimeNullableFilter = {};
    if (query.expiresFrom) dateFilter.gte = query.expiresFrom;
    if (query.expiresTo) dateFilter.lte = query.expiresTo;
    andClauses.push({ expires_at: dateFilter });
  }

  if (query.isActive !== undefined) {
    if (query.isActive) {
      andClauses.push({
        status: 'ACTIVE',
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      });
    } else {
      andClauses.push({
        OR: [
          { status: { not: 'ACTIVE' } },
          {
            AND: [{ status: 'ACTIVE' }, { expires_at: { lte: now } }],
          },
        ],
      });
    }
  }

  if (query.search) {
    const term = query.search;
    andClauses.push({
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
        {
          users_integration_api_keys_created_byTousers: {
            OR: [
              { full_name: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { username: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      ],
    });
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  return where;
}
