import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/event-ingestion/wazuh-ingestion.repository.js', () => ({
  wazuhIngestionRepository: {
    findSourceById: vi.fn(),
    ensureDefaultWazuhSource: vi.fn(),
    saveNormalizedEvent: vi.fn(),
  },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/automated-detection.worker.js', () => ({
  requestAutomatedDetection: vi.fn(),
}));

import { wazuhIngestionRepository } from '../src/modules/event-ingestion/wazuh-ingestion.repository.js';
import { wazuhIngestionService } from '../src/modules/event-ingestion/wazuh-ingestion.service.js';

const input = {
  source: { type: 'WAZUH' as const },
  eventFamily: 'AUTHENTICATION' as const,
  eventType: 'LOGIN_FAILURE',
  timestamp: '2026-09-28T08:30:00.000Z',
  rawEventId: 'raw-1',
  actor: { username: 'user' },
  agent: { id: '001', name: 'host' },
  rule: { id: '1' },
};

const saved = {
  id: 'evt-1',
  external_event_id: 'raw-1',
  event_family: 'AUTHENTICATION' as const,
  event_type: 'LOGIN_FAILURE',
  ingested_at: new Date('2026-09-28T08:30:05.000Z'),
};

describe('wazuhIngestionService.ingestNormalizedEvent source routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes to the source bound to the API key, not the default source', async () => {
    vi.mocked(wazuhIngestionRepository.findSourceById).mockResolvedValue({
      id: 'source-A',
      name: 'Wazuh A',
      status: 'ACTIVE',
      source_type: 'WAZUH',
    });
    vi.mocked(wazuhIngestionRepository.saveNormalizedEvent).mockResolvedValue(saved);

    const result = await wazuhIngestionService.ingestNormalizedEvent('source-A', input);

    expect(result.status).toBe('INGESTED');
    expect(wazuhIngestionRepository.saveNormalizedEvent).toHaveBeenCalledWith('source-A', input);
    expect(wazuhIngestionRepository.ensureDefaultWazuhSource).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the key-bound source is paused', async () => {
    vi.mocked(wazuhIngestionRepository.findSourceById).mockResolvedValue({
      id: 'source-A',
      name: 'Wazuh A',
      status: 'INACTIVE',
      source_type: 'WAZUH',
    });

    await expect(wazuhIngestionService.ingestNormalizedEvent('source-A', input)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(wazuhIngestionRepository.saveNormalizedEvent).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the key-bound source no longer exists', async () => {
    vi.mocked(wazuhIngestionRepository.findSourceById).mockResolvedValue(null);

    await expect(wazuhIngestionService.ingestNormalizedEvent('gone', input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(wazuhIngestionRepository.saveNormalizedEvent).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the key is bound to a non-Wazuh source', async () => {
    vi.mocked(wazuhIngestionRepository.findSourceById).mockResolvedValue({
      id: 'source-F',
      name: 'Firewall',
      status: 'ACTIVE',
      source_type: 'FIREWALL',
    });

    await expect(wazuhIngestionService.ingestNormalizedEvent('source-F', input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(wazuhIngestionRepository.saveNormalizedEvent).not.toHaveBeenCalled();
  });

  it('system token (no bound source) uses the default source when it is ACTIVE', async () => {
    vi.mocked(wazuhIngestionRepository.ensureDefaultWazuhSource).mockResolvedValue({
      id: 'default',
      name: 'Default',
      status: 'ACTIVE',
    });
    vi.mocked(wazuhIngestionRepository.saveNormalizedEvent).mockResolvedValue(saved);

    await wazuhIngestionService.ingestNormalizedEvent(null, input);

    expect(wazuhIngestionRepository.saveNormalizedEvent).toHaveBeenCalledWith('default', input);
  });

  it('system token cannot bypass a paused default source', async () => {
    vi.mocked(wazuhIngestionRepository.ensureDefaultWazuhSource).mockResolvedValue({
      id: 'default',
      name: 'Default',
      status: 'INACTIVE',
    });

    await expect(wazuhIngestionService.ingestNormalizedEvent(null, input)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(wazuhIngestionRepository.saveNormalizedEvent).not.toHaveBeenCalled();
  });
});
