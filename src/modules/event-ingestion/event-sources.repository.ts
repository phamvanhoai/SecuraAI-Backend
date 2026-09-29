import type { event_family, event_source_status, ingestion_method, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

export type EventSourceRecord = {
  id: string;
  name: string;
  source_type: string;
  endpoint: string | null;
  ingestion_method: ingestion_method;
  authentication_type: string | null;
  status: event_source_status;
  description: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  event_source_families: { event_family: event_family }[];
};

export type CreateEventSourceData = {
  name: string;
  sourceType: string;
  endpoint?: string | null | undefined;
  ingestionMethod: ingestion_method;
  authenticationType?: string | null | undefined;
  status?: event_source_status | undefined;
  description?: string | null | undefined;
  createdBy: string;
  eventFamilies: event_family[];
};

export type FindEventSourcesOptions = {
  skip: number;
  take: number;
  q?: string | undefined;
  sourceType?: string | undefined;
  status?: event_source_status | undefined;
  sortBy?: 'name' | 'sourceType' | 'status' | 'updatedAt' | 'createdAt' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
};

const eventSourceSelect = {
  id: true,
  name: true,
  source_type: true,
  endpoint: true,
  ingestion_method: true,
  authentication_type: true,
  status: true,
  description: true,
  created_by: true,
  created_at: true,
  updated_at: true,
  event_source_families: {
    select: {
      event_family: true,
    },
  },
} as const;

function buildWhere(
  options: Pick<FindEventSourcesOptions, 'q' | 'sourceType' | 'status'>,
): Prisma.event_sourcesWhereInput {
  const where: Prisma.event_sourcesWhereInput = {};
  if (options.status) {
    where.status = options.status;
  }
  if (options.sourceType) {
    where.source_type = { equals: options.sourceType, mode: 'insensitive' };
  }
  if (options.q) {
    where.OR = [
      { name: { contains: options.q, mode: 'insensitive' } },
      { source_type: { contains: options.q, mode: 'insensitive' } },
      { description: { contains: options.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Prisma.event_sourcesOrderByWithRelationInput {
  switch (sortBy) {
    case 'name':
      return { name: sortOrder };
    case 'sourceType':
      return { source_type: sortOrder };
    case 'status':
      return { status: sortOrder };
    case 'createdAt':
      return { created_at: sortOrder };
    case 'updatedAt':
    default:
      return { updated_at: sortOrder };
  }
}

export const eventSourcesRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  findByName(name: string) {
    return prisma.event_sources.findFirst({
      where: { name },
      select: { id: true, name: true },
    });
  },

  async create(data: CreateEventSourceData): Promise<EventSourceRecord> {
    return prisma.event_sources.create({
      data: {
        name: data.name,
        source_type: data.sourceType,
        endpoint: data.endpoint ?? null,
        ingestion_method: data.ingestionMethod,
        authentication_type: data.authenticationType ?? null,
        status: data.status ?? 'ACTIVE',
        description: data.description ?? null,
        created_by: data.createdBy,
        event_source_families: {
          create: data.eventFamilies.map((family) => ({
            event_family: family,
          })),
        },
      },
      select: eventSourceSelect,
    });
  },

  async findMany(options: FindEventSourcesOptions): Promise<EventSourceRecord[]> {
    const where = buildWhere(options);
    const orderBy = buildOrderBy(options.sortBy, options.sortOrder);

    return prisma.event_sources.findMany({
      where,
      orderBy,
      skip: options.skip,
      take: options.take,
      select: eventSourceSelect,
    });
  },

  async count(
    options: Pick<FindEventSourcesOptions, 'q' | 'sourceType' | 'status'>,
  ): Promise<number> {
    const where = buildWhere(options);
    return prisma.event_sources.count({ where });
  },

  findById(id: string) {
    return prisma.event_sources.findUnique({
      where: { id },
      select: {
        ...eventSourceSelect,
        users: {
          select: {
            id: true,
            email: true,
            full_name: true,
          },
        },
        integration_api_keys: {
          select: {
            id: true,
            name: true,
            key_prefix: true,
            status: true,
            expires_at: true,
            last_used_at: true,
            last_used_ip: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        },
        _count: {
          select: {
            normalized_events: true,
            event_ingestion_batches: true,
          },
        },
        event_ingestion_batches: {
          select: {
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });
  },
};
