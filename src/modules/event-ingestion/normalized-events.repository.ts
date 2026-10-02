import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListNormalizedEventsQuery } from './dto/list-normalized-events.dto.js';

export const normalizedEventsRepository = {
  async findEvents(params: ListNormalizedEventsQuery) {
    const sortFieldMap: Record<string, keyof Prisma.normalized_eventsOrderByWithRelationInput> = {
      occurredAt: 'occurred_at',
      ingestedAt: 'ingested_at',
      eventType: 'event_type',
      eventFamily: 'event_family',
      severity: 'severity',
      mappingStatus: 'mapping_status',
    };

    const sortField = sortFieldMap[params.sortBy] ?? 'occurred_at';
    const orderBy: Prisma.normalized_eventsOrderByWithRelationInput = {
      [sortField]: params.sortOrder,
    };

    const skip = (params.page - 1) * params.limit;
    const take = params.limit;

    const [items, total] = await Promise.all([
      prisma.normalized_events.findMany({
        orderBy,
        skip,
        take,
        select: {
          id: true,
          event_source_id: true,
          ingestion_batch_id: true,
          external_event_id: true,
          event_family: true,
          event_type: true,
          schema_version: true,
          occurred_at: true,
          ingested_at: true,
          account_identifier: true,
          source_ip: true,
          destination_ip: true,
          device_identifier: true,
          severity: true,
          mapping_status: true,
          created_at: true,
          event_sources: {
            select: {
              id: true,
              name: true,
              source_type: true,
            },
          },
          event_entity_mappings: {
            where: { is_active: true },
            take: 1,
            select: {
              assets: {
                select: {
                  id: true,
                  name: true,
                  asset_code: true,
                  asset_type: true,
                  criticality: true,
                },
              },
              users_event_entity_mappings_user_idTousers: {
                select: {
                  id: true,
                  email: true,
                  full_name: true,
                },
              },
            },
          },
          _count: {
            select: {
              anomaly_detections: true,
            },
          },
        },
      }),
      prisma.normalized_events.count(),
    ]);

    return { items, total };
  },

  async getMetrics() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalEvents, totalMapped, totalUnmapped, eventsLast24Hours, familyCounts] =
      await Promise.all([
        prisma.normalized_events.count(),
        prisma.normalized_events.count({ where: { mapping_status: 'MAPPED' } }),
        prisma.normalized_events.count({ where: { mapping_status: 'UNMAPPED' } }),
        prisma.normalized_events.count({ where: { occurred_at: { gte: oneDayAgo } } }),
        prisma.normalized_events.groupBy({
          by: ['event_family'],
          _count: { _all: true },
        }),
      ]);

    const byFamily: Record<string, number> = {
      AUTHENTICATION: 0,
      VPN_SSO: 0,
      APPLICATION_ACCESS: 0,
    };

    for (const item of familyCounts) {
      if (item.event_family in byFamily) {
        byFamily[item.event_family] = item._count._all;
      }
    }

    return {
      totalEvents,
      totalMapped,
      totalUnmapped,
      eventsLast24Hours,
      byFamily: {
        AUTHENTICATION: byFamily['AUTHENTICATION'] ?? 0,
        VPN_SSO: byFamily['VPN_SSO'] ?? 0,
        APPLICATION_ACCESS: byFamily['APPLICATION_ACCESS'] ?? 0,
      },
    };
  },
};
