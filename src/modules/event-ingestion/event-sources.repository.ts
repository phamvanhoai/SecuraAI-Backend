import type { event_family, event_source_status, ingestion_method } from '@prisma/client';
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
      select: {
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
      },
    });
  },
};
