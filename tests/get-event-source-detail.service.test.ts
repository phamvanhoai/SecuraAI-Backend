import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventSourcesRepository } from '../src/modules/event-ingestion/event-sources.repository.js';
import { eventSourcesService } from '../src/modules/event-ingestion/event-sources.service.js';

vi.mock('../src/modules/event-ingestion/event-sources.repository.js', () => ({
  eventSourcesRepository: {
    findActor: vi.fn(),
    findById: vi.fn(),
  },
}));

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const sourceId = '3a9bf33a-02db-48e4-a8ad-90517278d7f3';

const mockEventSourceDetailRecord = {
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
  integration_api_keys: [
    {
      id: 'key-1',
      name: 'Wazuh Ingestion Key',
      key_prefix: 'sec_live_9a8b7c',
      status: 'ACTIVE' as const,
      expires_at: new Date('2027-09-20T10:00:00Z'),
      last_used_at: new Date('2026-09-28T14:00:00Z'),
      last_used_ip: '192.168.1.100',
      created_at: new Date('2026-09-20T10:05:00Z'),
    },
  ],
  _count: {
    normalized_events: 14250,
    event_ingestion_batches: 120,
  },
  event_ingestion_batches: [
    {
      created_at: new Date('2026-09-28T14:00:00Z'),
    },
  ],
};

describe('eventSourcesService.getEventSourceDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated or inactive user', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue(null);

    await expect(
      eventSourcesService.getEventSourceDetail(userId, sourceId),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects unauthorized role (EMPLOYEE)', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });

    await expect(
      eventSourcesService.getEventSourceDetail(userId, sourceId),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('throws 404 when event source is not found', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(null);

    await expect(
      eventSourcesService.getEventSourceDetail(userId, sourceId),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Event source not found',
    });
  });

  it('returns comprehensive configuration details with masked credentials and stats for ADMIN', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(
      mockEventSourceDetailRecord,
    );

    const result = await eventSourcesService.getEventSourceDetail(userId, sourceId);

    expect(eventSourcesRepository.findById).toHaveBeenCalledWith(sourceId);
    expect(result.id).toBe(sourceId);
    expect(result.name).toBe('Wazuh Production SIEM');
    expect(result.sourceType).toBe('WAZUH');
    expect(result.endpoint).toBe('https://wazuh.internal:55000');
    expect(result.ingestionMethod).toBe('API');
    expect(result.status).toBe('ACTIVE');
    expect(result.eventFamilies).toEqual(['AUTHENTICATION', 'VPN_SSO']);
    expect(result.creator).toEqual({
      id: userId,
      email: 'admin@secura.ai',
      fullName: 'Security Admin',
    });
    expect(result.apiKeys).toHaveLength(1);
    expect(result.apiKeys[0]).toEqual({
      id: 'key-1',
      name: 'Wazuh Ingestion Key',
      keyPrefix: 'sec_live_9a8b7c',
      maskedKey: 'sec_live_9a8b7c...****',
      status: 'ACTIVE',
      expiresAt: new Date('2027-09-20T10:00:00Z'),
      lastUsedAt: new Date('2026-09-28T14:00:00Z'),
      lastUsedIp: '192.168.1.100',
      createdAt: new Date('2026-09-20T10:05:00Z'),
    });
    expect(result.stats).toEqual({
      totalIngestedEvents: 14250,
      totalBatches: 120,
      lastIngestedAt: new Date('2026-09-28T14:00:00Z'),
    });
  });

  it('allows SECURITY_OFFICER role to view event source detail', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(
      mockEventSourceDetailRecord,
    );

    const result = await eventSourcesService.getEventSourceDetail(userId, sourceId);
    expect(result.name).toBe('Wazuh Production SIEM');
  });
});
