import { z } from 'zod';
import { EVENT_FAMILIES } from './create-event-source.dto.js';

export const importEventItemSchema = z.object({
  externalEventId: z.string().trim().max(255).optional().nullable(),
  eventFamily: z.enum(EVENT_FAMILIES),
  eventType: z.string().trim().min(1, 'Event type is required').max(150),
  occurredAt: z
    .string()
    .datetime({ offset: true, message: 'Invalid ISO datetime for occurredAt' })
    .or(z.string().min(1)),
  accountIdentifier: z.string().trim().max(255).optional().nullable(),
  sourceIp: z.string().trim().max(45).optional().nullable(),
  destinationIp: z.string().trim().max(45).optional().nullable(),
  deviceIdentifier: z.string().trim().max(255).optional().nullable(),
  severity: z.string().trim().max(50).optional().nullable(),
  normalizedPayload: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type ImportEventItem = z.infer<typeof importEventItemSchema>;

export const importEventsBodySchema = z.object({
  fileName: z.string().trim().max(255).optional().nullable(),
  fileFormat: z.enum(['JSON', 'CSV']).default('JSON'),
  eventFamily: z.enum(EVENT_FAMILIES).optional().nullable(),
  events: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, 'At least one event record must be provided for import')
    .max(5000, 'Batch size cannot exceed 5000 records per import'),
});

export type ImportEventsBody = z.infer<typeof importEventsBodySchema>;

export type InvalidEventRecord = {
  recordIndex: number;
  errorCode: string;
  errorMessage: string;
  receivedPayload: Record<string, unknown>;
};

export type ImportEventsResponseDto = {
  batchId: string;
  eventSourceId: string;
  eventSourceName: string;
  fileName: string | null;
  fileFormat: string;
  totalRecords: number;
  acceptedRecords: number;
  rejectedRecords: number;
  status: 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
  startedAt: Date;
  completedAt: Date;
  errors: Array<{
    recordIndex: number;
    errorCode: string;
    errorMessage: string;
  }>;
};

export const batchIdParamSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID format'),
});

export type BatchIdParam = z.infer<typeof batchIdParamSchema>;

export const getBatchInvalidEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  errorCode: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

export type GetBatchInvalidEventsQuery = z.infer<typeof getBatchInvalidEventsQuerySchema>;

export const getSourceBatchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type GetSourceBatchesQuery = z.infer<typeof getSourceBatchesQuerySchema>;

export type BatchDetailResponseDto = {
  id: string;
  eventSourceId: string;
  eventSourceName: string;
  ingestionMethod: string;
  eventFamily: string | null;
  fileName: string | null;
  fileFormat: string | null;
  totalRecords: number;
  acceptedRecords: number;
  rejectedRecords: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
  startedAt: Date | null;
  completedAt: Date | null;
  createdBy: string | null;
  creatorName: string | null;
  createdAt: Date;
};

export type InvalidEventItemDto = {
  id: string;
  batchId: string | null;
  eventSourceId: string;
  eventFamily: string | null;
  recordIndex: number | null;
  errorCode: string;
  errorMessage: string;
  rawPayload: Record<string, unknown> | null;
  createdAt: Date;
};

export type PaginatedInvalidEventsDto = {
  items: InvalidEventItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type PaginatedBatchesDto = {
  items: BatchDetailResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
