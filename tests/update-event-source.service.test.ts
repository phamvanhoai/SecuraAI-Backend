import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/common/errors/app-error.js';
import { eventSourcesRepository } from '../src/modules/event-ingestion/event-sources.repository.js';
import { eventSourcesService } from '../src/modules/event-ingestion/event-sources.service.js';

vi.mock('../src/modules/event-ingestion/event-sources.repository.js', () => ({
  eventSourcesRepository: {
    findActor: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    update: vi.fn(),
  },
}));

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const sourceId = '3a9bf33a-02db-48e4-a8ad-90517278d7f3';

const mockExistingRecord = {
  id: sourceId,
  name: 'Wazuh Production SIEM',
  source_type: 'WAZUH',
  endpoint: 'https://wazuh.internal:55000',
  ingestion_method: 'API' as const,
  authentication_type: 'API_KEY',
  status: 'ACTIVE' as const,
  description: 'Main production security event log collector',
  created_by: userId,
  created_at: new Date('2026-09-20T10:00:00Z'),
  updated_at: new Date('2026-09-27T12:00:00Z'),
  event_source_families: [
    { event_family: 'AUTHENTICATION' as const },
    { event_family: 'VPN_SSO' as const },
  ],
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

describe('eventSourcesService.updateEventSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully updates event source configuration for ADMIN', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(mockExistingRecord);
    vi.mocked(eventSourcesRepository.update).mockResolvedValue({
      id: sourceId,
      name: 'Wazuh SIEM Updated',
      source_type: 'WAZUH',
      endpoint: 'https://wazuh.internal:55000',
      ingestion_method: 'API' as const,
      authentication_type: 'API_KEY',
      status: 'INACTIVE' as const,
      description: 'Updated description',
      created_by: userId,
      created_at: new Date('2026-09-20T10:00:00Z'),
      updated_at: new Date('2026-09-29T12:00:00Z'),
      event_source_families: [{ event_family: 'AUTHENTICATION' as const }],
    });

    const result = await eventSourcesService.updateEventSource(userId, sourceId, {
      name: 'Wazuh SIEM Updated',
      status: 'INACTIVE',
      description: 'Updated description',
      eventFamilies: ['AUTHENTICATION'],
    });

    expect(result.id).toBe(sourceId);
    expect(result.name).toBe('Wazuh SIEM Updated');
    expect(result.status).toBe('INACTIVE');
    expect(result.description).toBe('Updated description');
    expect(result.eventFamilies).toEqual(['AUTHENTICATION']);
  });

  it('successfully updates event source configuration for SECURITY_OFFICER', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(mockExistingRecord);
    vi.mocked(eventSourcesRepository.update).mockResolvedValue({
      id: sourceId,
      name: 'Wazuh Production SIEM',
      source_type: 'WAZUH',
      endpoint: 'https://wazuh-new.internal:55000',
      ingestion_method: 'API' as const,
      authentication_type: 'API_KEY',
      status: 'ACTIVE' as const,
      description: 'Main production security event log collector',
      created_by: userId,
      created_at: new Date('2026-09-20T10:00:00Z'),
      updated_at: new Date('2026-09-29T12:00:00Z'),
      event_source_families: [
        { event_family: 'AUTHENTICATION' as const },
        { event_family: 'VPN_SSO' as const },
      ],
    });

    const result = await eventSourcesService.updateEventSource(userId, sourceId, {
      endpoint: 'https://wazuh-new.internal:55000',
    });

    expect(result.endpoint).toBe('https://wazuh-new.internal:55000');
  });

  it('rejects unauthorized user role', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });

    await expect(
      eventSourcesService.updateEventSource(userId, sourceId, { name: 'New Name' }),
    ).rejects.toThrow(AppError);
  });

  it('rejects when event source is not found (404)', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(null);

    await expect(
      eventSourcesService.updateEventSource(userId, sourceId, { name: 'New Name' }),
    ).rejects.toThrow(AppError);
  });

  it('rejects duplicate event source name (409)', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(mockExistingRecord);
    vi.mocked(eventSourcesRepository.findByName).mockResolvedValue({
      id: 'other-source-id',
      name: 'Existing Other Name',
    });

    await expect(
      eventSourcesService.updateEventSource(userId, sourceId, { name: 'Existing Other Name' }),
    ).rejects.toThrow(AppError);
  });
});
