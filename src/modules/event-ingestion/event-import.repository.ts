import type {
  event_family,
  ingestion_batch_status,
  ingestion_method,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ImportEventItem, InvalidEventRecord } from './dto/import-events.dto.js';

export type CreateBatchParams = {
  eventSourceId: string;
  ingestionMethod: ingestion_method;
  eventFamily?: event_family | null | undefined;
  fileName?: string | null | undefined;
  fileFormat?: string | null | undefined;
  totalRecords: number;
  userId?: string | undefined;
};

export type ValidatedEventRecord = ImportEventItem & {
  occurredAtDate: Date;
};

export const eventImportRepository = {
  async createIngestionBatch(params: CreateBatchParams) {
    return prisma.event_ingestion_batches.create({
      data: {
        event_source_id: params.eventSourceId,
        ingestion_method: params.ingestionMethod,
        event_family: params.eventFamily ?? null,
        file_name: params.fileName ?? null,
        file_format: params.fileFormat ?? 'JSON',
        total_records: params.totalRecords,
        status: 'PROCESSING',
        started_at: new Date(),
        created_by: params.userId ?? null,
      },
      select: {
        id: true,
        event_source_id: true,
        file_name: true,
        file_format: true,
        total_records: true,
        status: true,
        started_at: true,
        created_at: true,
      },
    });
  },

  async saveBatchResults(
    batchId: string,
    eventSourceId: string,
    validRecords: ValidatedEventRecord[],
    invalidRecords: InvalidEventRecord[],
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Insert valid normalized events
      if (validRecords.length > 0) {
        const normalizedData: Prisma.normalized_eventsCreateManyInput[] = validRecords.map((item) => {
          const payload = (item.normalizedPayload ?? item) as unknown as Prisma.InputJsonValue;
          return {
            event_source_id: eventSourceId,
            ingestion_batch_id: batchId,
            external_event_id: item.externalEventId ?? null,
            event_family: item.eventFamily,
            event_type: item.eventType,
            occurred_at: item.occurredAtDate,
            account_identifier: item.accountIdentifier ?? null,
            source_ip: item.sourceIp ?? null,
            destination_ip: item.destinationIp ?? null,
            device_identifier: item.deviceIdentifier ?? null,
            severity: item.severity ?? null,
            mapping_status: 'UNMAPPED',
            normalized_payload: payload,
          };
        });

        // Use createMany with skipDuplicates to avoid crashing on duplicate external_event_id
        await tx.normalized_events.createMany({
          data: normalizedData,
          skipDuplicates: true,
        });
      }

      // 2. Insert invalid events
      if (invalidRecords.length > 0) {
        const invalidData: Prisma.invalid_eventsCreateManyInput[] = invalidRecords.map((inv) => ({
          event_source_id: eventSourceId,
          ingestion_batch_id: batchId,
          record_index: inv.recordIndex,
          error_code: inv.errorCode,
          error_message: inv.errorMessage,
          received_payload: inv.receivedPayload as unknown as Prisma.InputJsonValue,
        }));

        await tx.invalid_events.createMany({
          data: invalidData,
        });
      }

      // 3. Determine final status
      let finalStatus: ingestion_batch_status;
      if (invalidRecords.length === 0) {
        finalStatus = 'COMPLETED';
      } else if (validRecords.length === 0) {
        finalStatus = 'FAILED';
      } else {
        finalStatus = 'PARTIALLY_COMPLETED';
      }

      const completedAt = new Date();

      const updatedBatch = await tx.event_ingestion_batches.update({
        where: { id: batchId },
        data: {
          accepted_records: validRecords.length,
          rejected_records: invalidRecords.length,
          status: finalStatus,
          completed_at: completedAt,
        },
        select: {
          id: true,
          event_source_id: true,
          file_name: true,
          file_format: true,
          total_records: true,
          accepted_records: true,
          rejected_records: true,
          status: true,
          started_at: true,
          completed_at: true,
        },
      });

      return updatedBatch;
    });
  },

  async findBatchById(batchId: string) {
    return prisma.event_ingestion_batches.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        event_source_id: true,
        ingestion_method: true,
        event_family: true,
        file_name: true,
        file_format: true,
        total_records: true,
        accepted_records: true,
        rejected_records: true,
        status: true,
        started_at: true,
        completed_at: true,
        created_by: true,
        created_at: true,
        event_sources: {
          select: {
            id: true,
            name: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            full_name: true,
          },
        },
      },
    });
  },

  async findInvalidEventsByBatchId(
    batchId: string,
    params: { page: number; limit: number; errorCode?: string | undefined; q?: string | undefined },
  ) {
    const { page, limit, errorCode, q } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.invalid_eventsWhereInput = {
      ingestion_batch_id: batchId,
      ...(errorCode ? { error_code: errorCode } : {}),
      ...(q
        ? {
            OR: [
              { error_message: { contains: q, mode: 'insensitive' } },
              { error_code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.invalid_events.findMany({
        where,
        skip,
        take: limit,
        orderBy: { record_index: 'asc' },
        select: {
          id: true,
          ingestion_batch_id: true,
          event_source_id: true,
          event_family: true,
          record_index: true,
          error_code: true,
          error_message: true,
          received_payload: true,
          created_at: true,
        },
      }),
      prisma.invalid_events.count({ where }),
    ]);

    return { items, total };
  },

  async findBatchesBySourceId(sourceId: string, params: { page: number; limit: number }) {
    const { page, limit } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.event_ingestion_batchesWhereInput = {
      event_source_id: sourceId,
    };

    const [items, total] = await Promise.all([
      prisma.event_ingestion_batches.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          event_source_id: true,
          ingestion_method: true,
          event_family: true,
          file_name: true,
          file_format: true,
          total_records: true,
          accepted_records: true,
          rejected_records: true,
          status: true,
          started_at: true,
          completed_at: true,
          created_by: true,
          created_at: true,
          event_sources: {
            select: {
              id: true,
              name: true,
            },
          },
          users: {
            select: {
              id: true,
              email: true,
              full_name: true,
            },
          },
        },
      }),
      prisma.event_ingestion_batches.count({ where }),
    ]);

    return { items, total };
  },
};
