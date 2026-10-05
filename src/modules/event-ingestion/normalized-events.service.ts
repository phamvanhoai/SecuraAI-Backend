import { AppError } from '../../common/errors/app-error.js';
import { normalizedEventsRepository } from './normalized-events.repository.js';
import type {
  EntityMappingDto,
  ListNormalizedEventsQuery,
  MappingOptionsDto,
  NormalizedEventDetailDto,
  NormalizedEventItemDto,
  NormalizedEventMetricsDto,
  PaginatedNormalizedEventsDto,
  UpdateEntityMappingDto,
} from './dto/list-normalized-events.dto.js';

type RawMappingRecord = {
  id: string;
  event_id: string;
  user_id: string | null;
  monitored_account_id: string | null;
  asset_id: string | null;
  mapping_method: 'AUTO' | 'MANUAL';
  confidence: unknown;
  reason: string | null;
  mapped_by: string | null;
  mapped_at: Date;
  is_active: boolean;
  supersedes_mapping_id: string | null;
  created_at: Date;
  assets: {
    id: string;
    name: string;
    asset_code: string;
    asset_type: string;
    criticality: string | null;
  } | null;
  users_event_entity_mappings_user_idTousers: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  users_event_entity_mappings_mapped_byTousers: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  monitored_accounts: {
    id: string;
    account_identifier: string;
    source_system: string;
    display_name: string | null;
  } | null;
};

function formatEntityMapping(m: RawMappingRecord): EntityMappingDto {
  return {
    id: m.id,
    eventId: m.event_id,
    userId: m.user_id,
    monitoredAccountId: m.monitored_account_id,
    assetId: m.asset_id,
    mappingMethod: m.mapping_method,
    confidence: m.confidence !== null ? Number(m.confidence) : null,
    reason: m.reason,
    mappedBy: m.users_event_entity_mappings_mapped_byTousers
      ? {
          id: m.mapped_by ?? '',
          email: m.users_event_entity_mappings_mapped_byTousers.email,
          fullName: m.users_event_entity_mappings_mapped_byTousers.full_name,
        }
      : null,
    mappedAt: m.mapped_at,
    isActive: m.is_active,
    supersedesMappingId: m.supersedes_mapping_id,
    mappedUser: m.users_event_entity_mappings_user_idTousers
      ? {
          id: m.users_event_entity_mappings_user_idTousers.id,
          email: m.users_event_entity_mappings_user_idTousers.email,
          fullName: m.users_event_entity_mappings_user_idTousers.full_name,
        }
      : null,
    mappedAsset: m.assets
      ? {
          id: m.assets.id,
          name: m.assets.name,
          assetCode: m.assets.asset_code,
          assetType: m.assets.asset_type,
          criticality: m.assets.criticality,
        }
      : null,
    monitoredAccount: m.monitored_accounts
      ? {
          id: m.monitored_accounts.id,
          accountIdentifier: m.monitored_accounts.account_identifier,
          sourceSystem: m.monitored_accounts.source_system,
          displayName: m.monitored_accounts.display_name,
        }
      : null,
    createdAt: m.created_at,
  };
}

export const normalizedEventsService = {
  async listEvents(
    _userId: string,
    query: ListNormalizedEventsQuery,
  ): Promise<PaginatedNormalizedEventsDto> {
    const { items, total } = await normalizedEventsRepository.findEvents(query);

    const formattedItems: NormalizedEventItemDto[] = items.map((event) => {
      const activeMapping = event.event_entity_mappings[0];
      const mappedUser = activeMapping?.users_event_entity_mappings_user_idTousers
        ? {
            id: activeMapping.users_event_entity_mappings_user_idTousers.id,
            email: activeMapping.users_event_entity_mappings_user_idTousers.email,
            fullName: activeMapping.users_event_entity_mappings_user_idTousers.full_name,
          }
        : null;

      const mappedAsset = activeMapping?.assets
        ? {
            id: activeMapping.assets.id,
            name: activeMapping.assets.name,
            assetCode: activeMapping.assets.asset_code,
            assetType: activeMapping.assets.asset_type,
            criticality: activeMapping.assets.criticality,
          }
        : null;

      return {
        id: event.id,
        eventSourceId: event.event_source_id,
        eventSourceName: event.event_sources.name,
        eventSourceType: event.event_sources.source_type,
        ingestionBatchId: event.ingestion_batch_id,
        externalEventId: event.external_event_id,
        eventFamily: event.event_family,
        eventType: event.event_type,
        schemaVersion: event.schema_version,
        occurredAt: event.occurred_at,
        ingestedAt: event.ingested_at,
        accountIdentifier: event.account_identifier,
        sourceIp: event.source_ip,
        destinationIp: event.destination_ip,
        deviceIdentifier: event.device_identifier,
        severity: event.severity,
        mappingStatus: event.mapping_status,
        mappedUser,
        mappedAsset,
        anomalyCount: event._count.anomaly_detections,
        createdAt: event.created_at,
      };
    });

    return {
      items: formattedItems,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  },

  async getEventDetail(
    _userId: string,
    id: string,
  ): Promise<NormalizedEventDetailDto> {
    const event = await normalizedEventsRepository.findById(id);
    if (!event) {
      throw new AppError(404, 'NOT_FOUND', 'Normalized security event not found');
    }

    const mappingHistory = event.event_entity_mappings.map(formatEntityMapping);
    const activeMapping = mappingHistory.find((m) => m.isActive) ?? mappingHistory[0] ?? null;

    const mappedUser = activeMapping?.mappedUser ?? null;
    const mappedAsset = activeMapping?.mappedAsset ?? null;

    return {
      id: event.id,
      eventSourceId: event.event_source_id,
      eventSourceName: event.event_sources.name,
      eventSourceType: event.event_sources.source_type,
      ingestionBatchId: event.ingestion_batch_id,
      externalEventId: event.external_event_id,
      eventFamily: event.event_family,
      eventType: event.event_type,
      schemaVersion: event.schema_version,
      occurredAt: event.occurred_at,
      ingestedAt: event.ingested_at,
      accountIdentifier: event.account_identifier,
      sourceIp: event.source_ip,
      destinationIp: event.destination_ip,
      deviceIdentifier: event.device_identifier,
      severity: event.severity,
      mappingStatus: event.mapping_status,
      mappedUser,
      mappedAsset,
      activeMapping,
      mappingHistory,
      anomalyCount: event._count.anomaly_detections,
      createdAt: event.created_at,
      normalizedPayload: event.normalized_payload as Record<string, unknown>,
      anomalyDetections: event.anomaly_detections.map((a) => ({
        id: a.id,
        anomalyScore: Number(a.anomaly_score),
        threshold: Number(a.threshold),
        isAnomaly: a.is_anomaly,
        detectedAt: a.detected_at,
      })),
    };
  },

  async updateEventMapping(
    userId: string,
    eventId: string,
    input: UpdateEntityMappingDto,
  ): Promise<EntityMappingDto> {
    try {
      const result = await normalizedEventsRepository.updateMapping({
        eventId,
        userId: input.userId ?? null,
        assetId: input.assetId ?? null,
        monitoredAccountId: input.monitoredAccountId ?? null,
        reason: input.reason,
        confidence: input.confidence ?? 1.0,
        mappedByUserId: userId,
      });

      if (!result) {
        throw new AppError(404, 'NOT_FOUND', 'Normalized security event not found');
      }

      return formatEntityMapping(result);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      if (err instanceof Error) {
        if (err.message === 'TARGET_USER_NOT_FOUND') {
          throw new AppError(404, 'NOT_FOUND', 'Target user not found');
        }
        if (err.message === 'TARGET_ASSET_NOT_FOUND') {
          throw new AppError(404, 'NOT_FOUND', 'Target asset not found');
        }
      }
      throw err;
    }
  },

  async getMappingOptions(_userId: string): Promise<MappingOptionsDto> {
    const options = await normalizedEventsRepository.getMappingOptions();
    return {
      users: options.users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
      })),
      assets: options.assets.map((a) => ({
        id: a.id,
        name: a.name,
        assetCode: a.asset_code,
        assetType: a.asset_type,
        criticality: a.criticality ?? null,
      })),
      monitoredAccounts: options.monitoredAccounts.map((m) => ({
        id: m.id,
        accountIdentifier: m.account_identifier,
        sourceSystem: m.source_system,
        displayName: m.display_name,
      })),
    };
  },

  async getMetrics(_userId: string): Promise<NormalizedEventMetricsDto> {
    return normalizedEventsRepository.getMetrics();
  },
};
