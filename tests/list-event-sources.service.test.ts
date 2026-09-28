import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventSourcesRepository } from '../src/modules/event-ingestion/event-sources.repository.js';
import { eventSourcesService } from '../src/modules/event-ingestion/event-sources.service.js';

vi.mock('../src/modules/event-ingestion/event-sources.repository.js', () => ({
  eventSourcesRepository: {
    findActor: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';

const mockEventSourceRecord = {
  id: 'src-1',
  name: 'Wazuh SIEM Production',
  source_type: 'WAZUH',
  endpoint: 'https://wazuh.internal:55000',
  ingestion_method: 'API' as const,
  authentication_type: 'BEARER_TOKEN',
  status: 'ACTIVE' as const,
  description: 'Production Wazuh cluster',
  created_by: userId,
  created_at: new Date('2026-09-20T10:00:00Z'),
  updated_at: new Date('2026-09-27T12:00:00Z'),
  event_source_families: [{ event_family: 'AUTHENTICATION' as const }, { event_family: 'VPN_SSO' as const }],
};

describe('eventSourcesService.listEventSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated or inactive user', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue(null);

    await expect(
      eventSourcesService.listEventSources(userId, {
        page: 1,
        limit: 20,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
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
      eventSourcesService.listEventSources(userId, {
        page: 1,
        limit: 20,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('returns paginated event sources for ADMIN', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findMany).mockResolvedValue([mockEventSourceRecord]);
    vi.mocked(eventSourcesRepository.count).mockResolvedValue(1);

    const result = await eventSourcesService.listEventSources(userId, {
      page: 1,
      limit: 20,
      q: 'wazuh',
      sourceType: 'WAZUH',
      status: 'ACTIVE',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(eventSourcesRepository.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 20,
      q: 'wazuh',
      sourceType: 'WAZUH',
      status: 'ACTIVE',
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(eventSourcesRepository.count).toHaveBeenCalledWith({
      q: 'wazuh',
      sourceType: 'WAZUH',
      status: 'ACTIVE',
    });

    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: 'src-1',
      name: 'Wazuh SIEM Production',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.internal:55000',
      ingestionMethod: 'API',
      authenticationType: 'BEARER_TOKEN',
      status: 'ACTIVE',
      description: 'Production Wazuh cluster',
      eventFamilies: ['AUTHENTICATION', 'VPN_SSO'],
      createdBy: userId,
      createdAt: new Date('2026-09-20T10:00:00Z'),
      updatedAt: new Date('2026-09-27T12:00:00Z'),
    });
  });

  it('allows SECURITY_OFFICER to view event source list', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findMany).mockResolvedValue([]);
    vi.mocked(eventSourcesRepository.count).mockResolvedValue(0);

    const result = await eventSourcesService.listEventSources(userId, {
      page: 1,
      limit: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(1);
  });
});
