import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/common/errors/app-error.js';
import { eventImportRepository } from '../src/modules/event-ingestion/event-import.repository.js';
import { eventSourcesRepository } from '../src/modules/event-ingestion/event-sources.repository.js';
import { eventImportService } from '../src/modules/event-ingestion/event-import.service.js';

describe('eventImportService - view import results', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBatchDetail', () => {
    it('returns summary report for an existing batch', async () => {
      const mockBatch = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        event_source_id: 'src-123',
        ingestion_method: 'FILE' as const,
        event_family: 'AUTHENTICATION' as const,
        file_name: 'test_events.json',
        file_format: 'JSON',
        total_records: 10,
        accepted_records: 8,
        rejected_records: 2,
        status: 'PARTIALLY_COMPLETED' as const,
        started_at: new Date('2026-09-30T10:00:00Z'),
        completed_at: new Date('2026-09-30T10:00:02Z'),
        created_by: 'usr-1',
        created_at: new Date('2026-09-30T10:00:00Z'),
        event_sources: {
          id: 'src-123',
          name: 'Corporate Wazuh',
        },
        users: {
          id: 'usr-1',
          email: 'admin@secura.ai',
          full_name: 'System Admin',
        },
      };

      vi.spyOn(eventImportRepository, 'findBatchById').mockResolvedValue(mockBatch);

      const result = await eventImportService.getBatchDetail('550e8400-e29b-41d4-a716-446655440000');

      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.eventSourceName).toBe('Corporate Wazuh');
      expect(result.totalRecords).toBe(10);
      expect(result.acceptedRecords).toBe(8);
      expect(result.rejectedRecords).toBe(2);
      expect(result.status).toBe('PARTIALLY_COMPLETED');
      expect(result.creatorName).toBe('System Admin');
    });

    it('throws 404 NOT_FOUND when batch does not exist', async () => {
      vi.spyOn(eventImportRepository, 'findBatchById').mockResolvedValue(null);

      await expect(
        eventImportService.getBatchDetail('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toThrow(AppError);
    });
  });

  describe('getBatchInvalidEvents', () => {
    it('returns paginated invalid event records for a batch', async () => {
      const mockBatch = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        event_source_id: 'src-123',
        ingestion_method: 'FILE' as const,
        event_family: 'AUTHENTICATION' as const,
        file_name: 'test_events.json',
        file_format: 'JSON',
        total_records: 10,
        accepted_records: 8,
        rejected_records: 2,
        status: 'PARTIALLY_COMPLETED' as const,
        started_at: new Date('2026-09-30T10:00:00Z'),
        completed_at: new Date('2026-09-30T10:00:02Z'),
        created_by: 'usr-1',
        created_at: new Date('2026-09-30T10:00:00Z'),
        event_sources: {
          id: 'src-123',
          name: 'Corporate Wazuh',
        },
        users: {
          id: 'usr-1',
          email: 'admin@secura.ai',
          full_name: 'System Admin',
        },
      };
      vi.spyOn(eventImportRepository, 'findBatchById').mockResolvedValue(mockBatch);

      const mockInvalidEvents = [
        {
          id: 'inv-1',
          ingestion_batch_id: '550e8400-e29b-41d4-a716-446655440000',
          event_source_id: 'src-123',
          event_family: 'AUTHENTICATION' as const,
          record_index: 2,
          error_code: 'INVALID_TIMESTAMP',
          error_message: 'occurredAt is not a valid date/time format',
          received_payload: { eventType: 'LOGON' },
          created_at: new Date(),
        },
      ];

      vi.spyOn(eventImportRepository, 'findInvalidEventsByBatchId').mockResolvedValue({
        items: mockInvalidEvents,
        total: 1,
      });

      const result = await eventImportService.getBatchInvalidEvents(
        '550e8400-e29b-41d4-a716-446655440000',
        { page: 1, limit: 20 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.recordIndex).toBe(2);
      expect(result.items[0]?.errorCode).toBe('INVALID_TIMESTAMP');
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('getSourceBatches', () => {
    it('returns historical batches for an event source', async () => {
      vi.spyOn(eventSourcesRepository, 'findById').mockResolvedValue({
        id: 'src-123',
        name: 'Corporate Wazuh',
      } as never);

      vi.spyOn(eventImportRepository, 'findBatchesBySourceId').mockResolvedValue({
        items: [
          {
            id: 'batch-1',
            event_source_id: 'src-123',
            ingestion_method: 'FILE' as const,
            event_family: 'AUTHENTICATION' as const,
            file_name: 'log.json',
            file_format: 'JSON',
            total_records: 5,
            accepted_records: 5,
            rejected_records: 0,
            status: 'COMPLETED' as const,
            started_at: new Date(),
            completed_at: new Date(),
            created_by: null,
            created_at: new Date(),
            event_sources: { id: 'src-123', name: 'Corporate Wazuh' },
            users: null,
          },
        ] as never,
        total: 1,
      });

      const result = await eventImportService.getSourceBatches('src-123', { page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe('batch-1');
      expect(result.pagination.total).toBe(1);
    });
  });
});
