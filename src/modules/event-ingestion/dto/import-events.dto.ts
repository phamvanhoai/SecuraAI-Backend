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
