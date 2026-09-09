import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type {
  CreateLogSourceBody,
  ListLogSourcesQuery,
  UpdateLogSourceBody,
} from './dto/log-source.dto.js';
import type { NormalizedSecurityEvent } from './security-event.normalizer.js';

export const logSourceSelect = {
  log_source_id: true,
  name: true,
  source_type: true,
  configuration: true,
  status: true,
  last_received_at: true,
  created_at: true,
  updated_at: true,
  assets: { select: { asset_id: true, asset_code: true, name: true } },
  integrations: {
    select: { integration_id: true, name: true, integration_type: true },
  },
} satisfies Prisma.log_sourcesSelect;

export type LogSourceRecord = Prisma.log_sourcesGetPayload<{ select: typeof logSourceSelect }>;

const ingestionSourceSelect = {
  log_source_id: true,
  configuration: true,
  status: true,
} satisfies Prisma.log_sourcesSelect;

type RequestContext = {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

const toConfigurationJson = (
  configuration: CreateLogSourceBody['configuration'],
): Prisma.InputJsonObject => ({
  format: configuration.format,
  timezone: configuration.timezone,
  collectRawPayload: configuration.collectRawPayload,
  ...(configuration.pollingIntervalSeconds !== undefined && {
    pollingIntervalSeconds: configuration.pollingIntervalSeconds,
  }),
  ...(configuration.fieldMapping !== undefined && {
    fieldMapping: { ...configuration.fieldMapping },
  }),
});

const buildWhere = (query: ListLogSourcesQuery): Prisma.log_sourcesWhereInput => ({
  ...(query.sourceType !== undefined && { source_type: query.sourceType }),
  ...(query.status !== undefined && { status: query.status }),
  ...(query.assetId !== undefined && { asset_id: query.assetId }),
  ...(query.q !== undefined && { name: { contains: query.q, mode: 'insensitive' } }),
});

const buildOrderBy = (
  sortBy: ListLogSourcesQuery['sortBy'],
  sortOrder: ListLogSourcesQuery['sortOrder'],
): Prisma.log_sourcesOrderByWithRelationInput[] => {
  switch (sortBy) {
    case 'createdAt':
      return [{ created_at: sortOrder }, { log_source_id: 'asc' }];
    case 'updatedAt':
      return [{ updated_at: sortOrder }, { log_source_id: 'asc' }];
    case 'lastReceivedAt':
      return [{ last_received_at: sortOrder }, { log_source_id: 'asc' }];
    case 'name':
      return [{ name: sortOrder }, { log_source_id: 'asc' }];
  }
};

export const securityMonitoringRepository = {
  async listLogSources(
    query: ListLogSourcesQuery,
  ): Promise<{ items: LogSourceRecord[]; total: number }> {
    const where = buildWhere(query);
    const [total, items] = await prisma.$transaction([
      prisma.log_sources.count({ where }),
      prisma.log_sources.findMany({
        where,
        select: logSourceSelect,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },

  findActiveAsset(assetId: string) {
    return prisma.assets.findFirst({
      where: { asset_id: assetId, deleted_at: null, status: { not: 'disposed' } },
      select: { asset_id: true },
    });
  },

  findUsableIntegration(integrationId: string) {
    return prisma.integrations.findFirst({
      where: { integration_id: integrationId, status: { not: 'disabled' } },
      select: { integration_id: true },
    });
  },

  findLogSourceForIngestion(logSourceId: string) {
    return prisma.log_sources.findUnique({
      where: { log_source_id: logSourceId },
      select: ingestionSourceSelect,
    });
  },

  ingestSecurityEvents(
    logSourceId: string,
    events: NormalizedSecurityEvent[],
    context: RequestContext,
  ): Promise<{ ingested: number; duplicates: number } | null> {
    return prisma.$transaction(async (transaction) => {
      const source = await transaction.log_sources.findUnique({
        where: { log_source_id: logSourceId },
        select: { log_source_id: true, status: true },
      });
      if (!source || source.status !== 'active') return null;

      const externalIds = [
        ...new Set(
          events.flatMap((event) => (event.externalEventId ? [event.externalEventId] : [])),
        ),
      ];
      const existing = externalIds.length
        ? await transaction.security_events.findMany({
            where: { log_source_id: logSourceId, external_event_id: { in: externalIds } },
            select: { external_event_id: true },
          })
        : [];
      const knownIds = new Set(
        existing.flatMap((event) => (event.external_event_id ? [event.external_event_id] : [])),
      );
      const seenIds = new Set<string>();
      const accepted = events.filter((event) => {
        if (!event.externalEventId) return true;
        if (knownIds.has(event.externalEventId) || seenIds.has(event.externalEventId)) return false;
        seenIds.add(event.externalEventId);
        return true;
      });

      if (accepted.length > 0) {
        await transaction.security_events.createMany({
          data: accepted.map((event) => ({
            log_source_id: logSourceId,
            external_event_id: event.externalEventId,
            event_type: event.eventType,
            severity: event.severity,
            event_time: event.eventTime,
            source_ip: event.sourceIp,
            destination_ip: event.destinationIp,
            ...(event.rawPayload !== null && { raw_payload: event.rawPayload }),
            normalized_data: event.normalizedData,
          })),
        });
        await transaction.log_sources.update({
          where: { log_source_id: logSourceId },
          data: { last_received_at: new Date(), updated_at: new Date() },
        });
      }

      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'security-monitoring',
          action: 'security_events.ingested',
          entity_type: 'log_source',
          entity_id: logSourceId,
          after_data: {
            received: events.length,
            ingested: accepted.length,
            duplicates: events.length - accepted.length,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return { ingested: accepted.length, duplicates: events.length - accepted.length };
    });
  },

  createLogSource(input: CreateLogSourceBody, context: RequestContext): Promise<LogSourceRecord> {
    return prisma.$transaction(async (transaction) => {
      const source = await transaction.log_sources.create({
        data: {
          name: input.name,
          source_type: input.sourceType,
          asset_id: input.assetId ?? null,
          integration_id: input.integrationId ?? null,
          configuration: toConfigurationJson(input.configuration),
          status: input.status,
          created_by_user_id: context.actorUserId,
        },
        select: logSourceSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'security-monitoring',
          action: 'log_source.created',
          entity_type: 'log_source',
          entity_id: source.log_source_id,
          after_data: {
            name: source.name,
            sourceType: source.source_type,
            status: source.status,
            assetId: input.assetId ?? null,
            integrationId: input.integrationId ?? null,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return source;
    });
  },

  updateLogSource(
    logSourceId: string,
    input: UpdateLogSourceBody,
    context: RequestContext,
  ): Promise<LogSourceRecord | null> {
    return prisma.$transaction(async (transaction) => {
      const current = await transaction.log_sources.findUnique({
        where: { log_source_id: logSourceId },
        select: {
          log_source_id: true,
          name: true,
          status: true,
          asset_id: true,
          integration_id: true,
          configuration: true,
        },
      });
      if (!current) return null;

      const source = await transaction.log_sources.update({
        where: { log_source_id: logSourceId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.assetId !== undefined && { asset_id: input.assetId }),
          ...(input.integrationId !== undefined && { integration_id: input.integrationId }),
          ...(input.configuration !== undefined && {
            configuration: toConfigurationJson(input.configuration),
          }),
          ...(input.status !== undefined && { status: input.status }),
          updated_at: new Date(),
        },
        select: logSourceSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'security-monitoring',
          action: 'log_source.updated',
          entity_type: 'log_source',
          entity_id: logSourceId,
          before_data: {
            name: current.name,
            status: current.status,
            assetId: current.asset_id,
            integrationId: current.integration_id,
            configuration: current.configuration ?? null,
          },
          after_data: {
            name: source.name,
            status: source.status,
            assetId: input.assetId ?? current.asset_id,
            integrationId: input.integrationId ?? current.integration_id,
            configuration: source.configuration ?? null,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return source;
    });
  },
};
