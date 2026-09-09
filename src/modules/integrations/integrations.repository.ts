import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const integrationSelect = {
  integration_id: true,
  name: true,
  integration_type: true,
  base_url: true,
  configuration: true,
  status: true,
  last_connected_at: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
} as const;

export type CreateIntegrationRepoInput = {
  name: string;
  integration_type: string;
  base_url?: string | null | undefined;
  configuration?: Prisma.InputJsonValue | undefined;
  created_by_user_id?: string | null | undefined;
  status?: string | undefined;
};

export type UpdateIntegrationRepoInput = {
  name?: string | undefined;
  base_url?: string | null | undefined;
  configuration?: Prisma.InputJsonValue | undefined;
  status?: string | undefined;
  last_connected_at?: Date | undefined;
};

export type FindIntegrationsRepoInput = {
  skip: number;
  take: number;
  type?: string | undefined;
  status?: string | undefined;
  search?: string | undefined;
  sortBy?: 'createdAt' | 'name' | 'lastConnectedAt' | 'status';
  sortOrder?: 'asc' | 'desc';
};

export type CreateIntegrationLogRepoInput = {
  integration_id: string;
  sync_job_id?: string | null | undefined;
  level: string;
  message: string;
  details?: Prisma.InputJsonValue | undefined;
};

export function buildWhereClause(params: {
  type?: string | undefined;
  status?: string | undefined;
  search?: string | undefined;
}): Prisma.integrationsWhereInput {
  const where: Prisma.integrationsWhereInput = {};
  if (params.type) where.integration_type = params.type;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { base_url: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export function buildOrderByClause(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Prisma.integrationsOrderByWithRelationInput {
  switch (sortBy) {
    case 'name':
      return { name: sortOrder };
    case 'lastConnectedAt':
      return { last_connected_at: sortOrder };
    case 'status':
      return { status: sortOrder };
    case 'createdAt':
    default:
      return { created_at: sortOrder };
  }
}

export const integrationsRepository = {
  create(data: CreateIntegrationRepoInput) {
    return prisma.integrations.create({
      data: {
        name: data.name,
        integration_type: data.integration_type,
        base_url: data.base_url ?? null,
        configuration: data.configuration ?? Prisma.DbNull,
        created_by_user_id: data.created_by_user_id ?? null,
        status: data.status ?? 'inactive',
      },
      select: integrationSelect,
    });
  },

  findById(id: string) {
    return prisma.integrations.findUnique({
      where: { integration_id: id },
      select: integrationSelect,
    });
  },

  findMany(params: FindIntegrationsRepoInput) {
    const where = buildWhereClause(params);
    const orderBy = buildOrderByClause(params.sortBy, params.sortOrder);

    return prisma.integrations.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy,
      select: integrationSelect,
    });
  },

  count(params: Omit<FindIntegrationsRepoInput, 'skip' | 'take' | 'sortBy' | 'sortOrder'>) {
    const where = buildWhereClause(params);
    return prisma.integrations.count({ where });
  },

  update(id: string, data: UpdateIntegrationRepoInput) {
    const updateData: Prisma.integrationsUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.base_url !== undefined) updateData.base_url = data.base_url;
    if (data.configuration !== undefined) {
      updateData.configuration = data.configuration === null ? Prisma.DbNull : data.configuration;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.last_connected_at !== undefined) updateData.last_connected_at = data.last_connected_at;
    updateData.updated_at = new Date();

    return prisma.integrations.update({
      where: { integration_id: id },
      data: updateData,
      select: integrationSelect,
    });
  },

  createLog(data: CreateIntegrationLogRepoInput) {
    return prisma.integration_logs.create({
      data: {
        integration_id: data.integration_id,
        sync_job_id: data.sync_job_id ?? null,
        level: data.level,
        message: data.message,
        details: data.details ?? Prisma.DbNull,
      },
      select: {
        integration_log_id: true,
        integration_id: true,
        level: true,
        message: true,
        created_at: true,
      },
    });
  },
};
