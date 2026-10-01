import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/event-ingestion/event-sources.repository.js', () => ({
  eventSourcesRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../src/modules/event-ingestion/event-import.repository.js', () => ({
  eventImportRepository: {
    createIngestionBatch: vi.fn(),
    saveBatchResults: vi.fn(),
  },
}));

import { eventSourcesRepository } from '../src/modules/event-ingestion/event-sources.repository.js';
import { eventImportRepository } from '../src/modules/event-ingestion/event-import.repository.js';
import { eventImportService } from '../src/modules/event-ingestion/event-import.service.js';

const sourceId = '3a9bf33a-02db-48e4-a8ad-90517278d7f2';
const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';

const mockEventSource = {
  id: sourceId,
  name: 'Corporate Wazuh Manager',
  source_type: 'WAZUH',
  endpoint: 'https://wazuh.internal:55000',
  ingestion_method: 'API' as const,
  authentication_type: 'BEARER_TOKEN',
  status: 'ACTIVE' as const,
  description: 'Primary SIEM cluster',
  created_by: userId,
  created_at: new Date(),
  updated_at: new Date(),
  event_source_families: [{ event_family: 'AUTHENTICATION' as const }],
  users: {
    id: userId,
    email: 'admin@secura.ai',
    full_name: 'Security Admin',
  },
  integration_api_keys: [],
  _count: {
    normalized_events: 0,
    event_ingestion_batches: 0,
  },
  event_ingestion_batches: [],
};

describe('eventImportService.importNormalizedEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully processes valid batch events and returns completed status', async () => {
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(mockEventSource);

    const now = new Date();
    vi.mocked(eventImportRepository.createIngestionBatch).mockResolvedValue({
      id: 'batch-001',
      event_source_id: sourceId,
      file_name: 'test.json',
      file_format: 'JSON',
      total_records: 1,
      status: 'PROCESSING',
      started_at: now,
      created_at: now,
    });

    vi.mocked(eventImportRepository.saveBatchResults).mockResolvedValue({
      id: 'batch-001',
      event_source_id: sourceId,
      file_name: 'test.json',
      file_format: 'JSON',
      total_records: 1,
      accepted_records: 1,
      rejected_records: 0,
      status: 'COMPLETED',
      started_at: now,
      completed_at: now,
    });

    const result = await eventImportService.importNormalizedEvents(
      sourceId,
      {
        fileName: 'test.json',
        fileFormat: 'JSON',
        eventFamily: 'AUTHENTICATION',
        events: [
          {
            eventType: 'USER_LOGIN',
            occurredAt: '2026-09-30T10:00:00.000Z',
            accountIdentifier: 'analyst@secura.ai',
          },
        ],
      },
      userId,
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.acceptedRecords).toBe(1);
    expect(result.rejectedRecords).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects import if event source is not found', async () => {
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(null);

    await expect(
      eventImportService.importNormalizedEvents(
        'non-existent-id',
        {
          fileFormat: 'JSON',
          events: [{ eventType: 'USER_LOGIN', occurredAt: '2026-09-30T10:00:00.000Z' }],
        },
        userId,
      ),
    ).rejects.toThrow(/Event source not found/);
  });

  it('rejects import if event source is INACTIVE', async () => {
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue({
      ...mockEventSource,
      status: 'INACTIVE',
    });

    await expect(
      eventImportService.importNormalizedEvents(
        sourceId,
        {
          fileFormat: 'JSON',
          events: [{ eventType: 'USER_LOGIN', occurredAt: '2026-09-30T10:00:00.000Z' }],
        },
        userId,
      ),
    ).rejects.toThrow(/Cannot import events to an inactive event source/);
  });
});
