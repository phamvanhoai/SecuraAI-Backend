import { AppError } from '../../common/errors/app-error.js';
import { eventSourcesRepository } from './event-sources.repository.js';
import { eventImportRepository, type ValidatedEventRecord } from './event-import.repository.js';
import {
  importEventItemSchema,
  type ImportEventsBody,
  type ImportEventsResponseDto,
  type InvalidEventRecord,
} from './dto/import-events.dto.js';

export const eventImportService = {
  async importNormalizedEvents(
    eventSourceId: string,
    body: ImportEventsBody,
    userId?: string,
  ): Promise<ImportEventsResponseDto> {
    const eventSource = await eventSourcesRepository.findById(eventSourceId);
    if (!eventSource) {
      throw new AppError(404, 'NOT_FOUND', 'Event source not found');
    }

    if (eventSource.status !== 'ACTIVE') {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'Cannot import events to an inactive event source. Please activate the source before importing.',
      );
    }

    const validRecords: ValidatedEventRecord[] = [];
    const invalidRecords: InvalidEventRecord[] = [];

    const totalRecords = body.events.length;

    for (let i = 0; i < totalRecords; i++) {
      const rawItem = body.events[i];
      if (!rawItem || typeof rawItem !== 'object') {
        invalidRecords.push({
          recordIndex: i,
          errorCode: 'INVALID_RECORD_FORMAT',
          errorMessage: 'Record must be a non-null JSON object',
          receivedPayload: typeof rawItem === 'object' && rawItem !== null ? rawItem : {},
        });
        continue;
      }

      // Auto-detect event family from eventType if missing, then use body.eventFamily fallback
      const rawType = typeof rawItem['eventType'] === 'string' ? rawItem['eventType'] : '';
      const autoDetectedFamily = detectEventFamilyFromType(rawType);

      const candidateItem = {
        ...rawItem,
        eventFamily: rawItem['eventFamily'] ?? autoDetectedFamily ?? body.eventFamily ?? undefined,
      };

      const parseResult = importEventItemSchema.safeParse(candidateItem);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.issues
          .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
          .join(', ');

        invalidRecords.push({
          recordIndex: i,
          errorCode: 'VALIDATION_FAILED',
          errorMessage: errorMsg,
          receivedPayload: rawItem,
        });
        continue;
      }

      const parsedData = parseResult.data;
      const occurredAtDate = new Date(parsedData.occurredAt);
      if (isNaN(occurredAtDate.getTime())) {
        invalidRecords.push({
          recordIndex: i,
          eventFamily: parsedData.eventFamily,
          errorCode: 'INVALID_TIMESTAMP',
          errorMessage: 'occurredAt is not a valid date/time format',
          receivedPayload: rawItem,
        });
        continue;
      }

      const now = new Date();
      if (occurredAtDate.getTime() > now.getTime() + 60_000) {
        invalidRecords.push({
          recordIndex: i,
          eventFamily: parsedData.eventFamily,
          errorCode: 'FUTURE_TIMESTAMP',
          errorMessage: `Event timestamp occurredAt (${parsedData.occurredAt}) cannot be in the future (must be <= current time)`,
          receivedPayload: rawItem,
        });
        continue;
      }

      validRecords.push({
        ...parsedData,
        occurredAtDate,
      });
    }

    // Create batch tracking record
    const batch = await eventImportRepository.createIngestionBatch({
      eventSourceId,
      ingestionMethod: 'FILE',
      eventFamily: body.eventFamily ?? null,
      fileName: body.fileName,
      fileFormat: body.fileFormat,
      totalRecords,
      userId,
    });

    // Save events & invalid records in transaction
    const completedBatch = await eventImportRepository.saveBatchResults(
      batch.id,
      eventSourceId,
      validRecords,
      invalidRecords,
    );

    return {
      batchId: completedBatch.id,
      eventSourceId: eventSource.id,
      eventSourceName: eventSource.name,
      fileName: completedBatch.file_name,
      fileFormat: completedBatch.file_format ?? body.fileFormat,
      totalRecords: completedBatch.total_records,
      acceptedRecords: completedBatch.accepted_records,
      rejectedRecords: completedBatch.rejected_records,
      status: completedBatch.status as 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED',
      startedAt: completedBatch.started_at ?? batch.started_at ?? new Date(),
      completedAt: completedBatch.completed_at ?? new Date(),
      errors: invalidRecords.map((inv) => ({
        recordIndex: inv.recordIndex,
        errorCode: inv.errorCode,
        errorMessage: inv.errorMessage,
      })),
    };
  },

  async getBatchDetail(batchId: string) {
    const batch = await eventImportRepository.findBatchById(batchId);
    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Import batch not found');
    }

    return {
      id: batch.id,
      eventSourceId: batch.event_source_id,
      eventSourceName: batch.event_sources.name,
      ingestionMethod: batch.ingestion_method,
      eventFamily: batch.event_family,
      fileName: batch.file_name,
      fileFormat: batch.file_format,
      totalRecords: batch.total_records,
      acceptedRecords: batch.accepted_records,
      rejectedRecords: batch.rejected_records,
      status: batch.status as
        'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED',
      startedAt: batch.started_at,
      completedAt: batch.completed_at,
      createdBy: batch.created_by,
      creatorName: batch.users?.full_name ?? batch.users?.email ?? null,
      createdAt: batch.created_at,
    };
  },

  async getBatchInvalidEvents(
    batchId: string,
    params: { page: number; limit: number; errorCode?: string | undefined; q?: string | undefined },
  ) {
    const batch = await eventImportRepository.findBatchById(batchId);
    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Import batch not found');
    }

    const { items, total } = await eventImportRepository.findInvalidEventsByBatchId(
      batchId,
      params,
    );

    return {
      items: items.map((inv) => ({
        id: inv.id,
        batchId: inv.ingestion_batch_id,
        eventSourceId: inv.event_source_id,
        eventFamily: inv.event_family,
        recordIndex: inv.record_index,
        errorCode: inv.error_code ?? 'UNKNOWN_ERROR',
        errorMessage: inv.error_message,
        rawPayload: inv.received_payload as Record<string, unknown> | null,
        createdAt: inv.created_at,
      })),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit) || 1,
      },
    };
  },

  async getSourceBatches(sourceId: string, params: { page: number; limit: number }) {
    const eventSource = await eventSourcesRepository.findById(sourceId);
    if (!eventSource) {
      throw new AppError(404, 'NOT_FOUND', 'Event source not found');
    }

    const { items, total } = await eventImportRepository.findBatchesBySourceId(sourceId, params);

    return {
      items: items.map((batch) => ({
        id: batch.id,
        eventSourceId: batch.event_source_id,
        eventSourceName: batch.event_sources.name,
        ingestionMethod: batch.ingestion_method,
        eventFamily: batch.event_family,
        fileName: batch.file_name,
        fileFormat: batch.file_format,
        totalRecords: batch.total_records,
        acceptedRecords: batch.accepted_records,
        rejectedRecords: batch.rejected_records,
        status: batch.status as
          'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED',
        startedAt: batch.started_at,
        completedAt: batch.completed_at,
        createdBy: batch.created_by,
        creatorName: batch.users?.full_name ?? batch.users?.email ?? null,
        createdAt: batch.created_at,
      })),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit) || 1,
      },
    };
  },
};

export function detectEventFamilyFromType(eventType: string): string | undefined {
  if (!eventType) return undefined;
  const upper = eventType.toUpperCase();

  // VPN & Remote SSO Access patterns (check first as they are specialized)
  if (
    upper.includes('VPN') ||
    upper.includes('SSO') ||
    upper.includes('OKTA') ||
    upper.includes('KEYCLOAK') ||
    upper.includes('SAML') ||
    upper.includes('OIDC') ||
    upper.includes('TUNNEL') ||
    upper.includes('GATEWAY') ||
    upper.includes('AZURE_AD')
  ) {
    return 'VPN_SSO';
  }

  // Application & Privilege Access patterns
  if (
    upper.includes('SUDO') ||
    upper.includes('PRIVILEGE') ||
    upper.includes('DATABASE') ||
    upper.includes('SQL') ||
    upper.includes('QUERY') ||
    upper.includes('EXEC') ||
    upper.includes('4672')
  ) {
    return 'APPLICATION_ACCESS';
  }

  // Authentication & Identity patterns
  if (
    upper.includes('LOGON') ||
    upper.includes('LOGIN') ||
    upper.includes('AUTH') ||
    upper.includes('PASSWD') ||
    upper.includes('SSH') ||
    upper.includes('PAM') ||
    upper.includes('CREDENTIAL') ||
    upper.includes('4624') ||
    upper.includes('4625') ||
    upper.includes('4740')
  ) {
    return 'AUTHENTICATION';
  }

  return undefined;
}
