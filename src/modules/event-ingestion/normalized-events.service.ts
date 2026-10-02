import { normalizedEventsRepository } from './normalized-events.repository.js';
import type {
  ListNormalizedEventsQuery,
  NormalizedEventItemDto,
  NormalizedEventMetricsDto,
  PaginatedNormalizedEventsDto,
} from './dto/list-normalized-events.dto.js';

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

  async getMetrics(_userId: string): Promise<NormalizedEventMetricsDto> {
    return normalizedEventsRepository.getMetrics();
  },
};
