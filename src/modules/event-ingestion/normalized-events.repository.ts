import { Prisma } from '@prisma/client';
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

    const where: Prisma.normalized_eventsWhereInput = {};
    const andConditions: Prisma.normalized_eventsWhereInput[] = [];

    // Time range filter
    const fromStr = params.from ?? params.startDate;
    const toStr = params.to ?? params.endDate;
    if (fromStr || toStr) {
      const occurredAtFilter: Prisma.DateTimeFilter = {};
      if (fromStr) {
        const fromDate = new Date(fromStr);
        if (!isNaN(fromDate.getTime())) {
          occurredAtFilter.gte = fromDate;
        }
      }
      if (toStr) {
        const toDate = new Date(toStr);
        if (!isNaN(toDate.getTime())) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(toStr.trim())) {
            toDate.setUTCHours(23, 59, 59, 999);
          }
          occurredAtFilter.lte = toDate;
        }
      }
      if (Object.keys(occurredAtFilter).length > 0) {
        andConditions.push({ occurred_at: occurredAtFilter });
      }
    }

    // Event Family filter
    if (params.eventFamily) {
      andConditions.push({ event_family: params.eventFamily });
    }

    // Event Source ID filter
    if (params.eventSourceId) {
      andConditions.push({ event_source_id: params.eventSourceId });
    }

    // Mapping Status filter
    if (params.mappingStatus) {
      andConditions.push({ mapping_status: params.mappingStatus });
    }

    // Severity filter
    if (params.severity) {
      andConditions.push({
        severity: { equals: params.severity, mode: 'insensitive' },
      });
    }

    // Event Type filter
    if (params.eventType) {
      andConditions.push({
        event_type: { contains: params.eventType, mode: 'insensitive' },
      });
    }

    // Source IP filter
    if (params.sourceIp) {
      andConditions.push({
        source_ip: { contains: params.sourceIp, mode: 'insensitive' },
      });
    }

    // User Account filter
    if (params.account) {
      andConditions.push({
        OR: [
          { account_identifier: { contains: params.account, mode: 'insensitive' } },
          {
            event_entity_mappings: {
              some: {
                is_active: true,
                users_event_entity_mappings_user_idTousers: {
                  OR: [
                    { email: { contains: params.account, mode: 'insensitive' } },
                    { full_name: { contains: params.account, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    // Associated Asset filter
    if (params.assetId) {
      andConditions.push({
        event_entity_mappings: {
          some: {
            is_active: true,
            asset_id: params.assetId,
          },
        },
      });
    } else if (params.asset) {
      andConditions.push({
        event_entity_mappings: {
          some: {
            is_active: true,
            assets: {
              OR: [
                { name: { contains: params.asset, mode: 'insensitive' } },
                { asset_code: { contains: params.asset, mode: 'insensitive' } },
              ],
            },
          },
        },
      });
    }

    // General Search (q)
    if (params.q) {
      const q = params.q.trim();
      andConditions.push({
        OR: [
          { event_type: { contains: q, mode: 'insensitive' } },
          { account_identifier: { contains: q, mode: 'insensitive' } },
          { source_ip: { contains: q, mode: 'insensitive' } },
          { destination_ip: { contains: q, mode: 'insensitive' } },
          { device_identifier: { contains: q, mode: 'insensitive' } },
          { external_event_id: { contains: q, mode: 'insensitive' } },
          { event_sources: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [items, total] = await Promise.all([
      prisma.normalized_events.findMany({
        where,
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
      prisma.normalized_events.count({ where }),
    ]);

    return { items, total };
  },

  async findById(id: string) {
    return prisma.normalized_events.findUnique({
      where: { id },
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
        normalized_payload: true,
        created_at: true,
        event_sources: {
          select: {
            id: true,
            name: true,
            source_type: true,
          },
        },
        event_entity_mappings: {
          orderBy: { mapped_at: 'desc' },
          select: {
            id: true,
            event_id: true,
            user_id: true,
            monitored_account_id: true,
            asset_id: true,
            mapping_method: true,
            confidence: true,
            reason: true,
            mapped_by: true,
            mapped_at: true,
            is_active: true,
            supersedes_mapping_id: true,
            created_at: true,
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
            users_event_entity_mappings_mapped_byTousers: {
              select: {
                id: true,
                email: true,
                full_name: true,
              },
            },
            monitored_accounts: {
              select: {
                id: true,
                account_identifier: true,
                source_system: true,
                display_name: true,
              },
            },
          },
        },
        anomaly_detections: {
          select: {
            id: true,
            anomaly_score: true,
            threshold: true,
            is_anomaly: true,
            detected_at: true,
          },
        },
        _count: {
          select: {
            anomaly_detections: true,
          },
        },
      },
    });
  },

  async updateMapping(params: {
    eventId: string;
    userId: string | null;
    assetId: string | null;
    monitoredAccountId: string | null;
    reason: string;
    confidence: number;
    mappedByUserId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const event = await tx.normalized_events.findUnique({
        where: { id: params.eventId },
        select: { id: true },
      });

      if (!event) {
        return null;
      }

      if (params.userId) {
        const user = await tx.users.findUnique({
          where: { id: params.userId },
          select: { id: true },
        });
        if (!user) {
          throw new Error('TARGET_USER_NOT_FOUND');
        }
      }

      if (params.assetId) {
        const asset = await tx.assets.findUnique({
          where: { id: params.assetId },
          select: { id: true },
        });
        if (!asset) {
          throw new Error('TARGET_ASSET_NOT_FOUND');
        }
      }

      // Find current active mapping
      const currentActive = await tx.event_entity_mappings.findFirst({
        where: { event_id: params.eventId, is_active: true },
        select: { id: true },
      });

      // Deactivate current active mapping(s)
      if (currentActive) {
        await tx.event_entity_mappings.updateMany({
          where: { event_id: params.eventId, is_active: true },
          data: { is_active: false },
        });
      }

      // Compute mapping status
      let mappingStatus: 'MAPPED' | 'PARTIALLY_MAPPED' | 'UNMAPPED' = 'UNMAPPED';
      if (params.userId && params.assetId) {
        mappingStatus = 'MAPPED';
      } else if (params.userId || params.assetId || params.monitoredAccountId) {
        mappingStatus = 'PARTIALLY_MAPPED';
      } else {
        mappingStatus = 'UNMAPPED';
      }

      // Create new mapping record
      const newMapping = await tx.event_entity_mappings.create({
        data: {
          event_id: params.eventId,
          user_id: params.userId,
          asset_id: params.assetId,
          monitored_account_id: params.monitoredAccountId,
          mapping_method: 'MANUAL',
          confidence: new Prisma.Decimal(params.confidence),
          reason: params.reason,
          mapped_by: params.mappedByUserId,
          mapped_at: new Date(),
          is_active: true,
          supersedes_mapping_id: currentActive?.id ?? null,
        },
        select: {
          id: true,
          event_id: true,
          user_id: true,
          monitored_account_id: true,
          asset_id: true,
          mapping_method: true,
          confidence: true,
          reason: true,
          mapped_by: true,
          mapped_at: true,
          is_active: true,
          supersedes_mapping_id: true,
          created_at: true,
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
          users_event_entity_mappings_mapped_byTousers: {
            select: {
              id: true,
              email: true,
              full_name: true,
            },
          },
          monitored_accounts: {
            select: {
              id: true,
              account_identifier: true,
              source_system: true,
              display_name: true,
            },
          },
        },
      });

      // Update mapping status on normalized event
      await tx.normalized_events.update({
        where: { id: params.eventId },
        data: { mapping_status: mappingStatus },
      });

      return newMapping;
    });
  },

  async getMappingOptions() {
    const [users, assets, monitoredAccounts] = await Promise.all([
      prisma.users.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          email: true,
          full_name: true,
        },
        orderBy: { email: 'asc' },
        take: 200,
      }),
      prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          asset_code: string;
          asset_type: string;
          criticality: string | null;
        }>
      >`
        SELECT id, name, asset_code, asset_type, criticality
        FROM assets
        WHERE archived_at IS NULL
        ORDER BY name ASC
        LIMIT 200
      `,
      prisma.monitored_accounts.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          account_identifier: true,
          source_system: true,
          display_name: true,
        },
        orderBy: { account_identifier: 'asc' },
        take: 200,
      }),
    ]);

    return { users, assets, monitoredAccounts };
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
