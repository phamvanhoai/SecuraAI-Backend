import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/event-ingestion/event-sources.repository.js', () => ({
  eventSourcesRepository: {
    findActor: vi.fn(),
    create: vi.fn(),
  },
}));

import { eventSourcesRepository } from '../src/modules/event-ingestion/event-sources.repository.js';
import { eventSourcesService } from '../src/modules/event-ingestion/event-sources.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const securityOfficerId = 'ec178d52-2959-47fd-93db-aa693158668c';
const employeeId = '11111111-2222-3333-4444-555555555555';

describe('eventSourcesService.registerEventSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows active ADMIN to register a normalized event source', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const now = new Date();
    vi.mocked(eventSourcesRepository.create).mockResolvedValue({
      id: 'source-123',
      name: 'Wazuh Production',
      source_type: 'WAZUH',
      endpoint: 'https://wazuh.corp:55000',
      ingestion_method: 'API',
      authentication_type: 'BEARER_TOKEN',
      status: 'ACTIVE',
      description: 'Wazuh SIEM cluster',
      created_by: adminId,
      created_at: now,
      updated_at: now,
      event_source_families: [
        { event_family: 'AUTHENTICATION' },
        { event_family: 'VPN_SSO' },
      ],
    });

    const result = await eventSourcesService.registerEventSource(adminId, {
      name: 'Wazuh Production',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.corp:55000',
      ingestionMethod: 'API',
      authenticationType: 'BEARER_TOKEN',
      status: 'ACTIVE',
      description: 'Wazuh SIEM cluster',
      eventFamilies: ['AUTHENTICATION', 'VPN_SSO'],
    });

    expect(result).toEqual({
      id: 'source-123',
      name: 'Wazuh Production',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.corp:55000',
      ingestionMethod: 'API',
      authenticationType: 'BEARER_TOKEN',
      status: 'ACTIVE',
      description: 'Wazuh SIEM cluster',
      eventFamilies: ['AUTHENTICATION', 'VPN_SSO'],
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    });
    expect(eventSourcesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wazuh Production',
        createdBy: adminId,
      }),
    );
  });

  it('allows active SECURITY_OFFICER to register an event source', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: securityOfficerId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });

    const now = new Date();
    vi.mocked(eventSourcesRepository.create).mockResolvedValue({
      id: 'source-456',
      name: 'Batch Syslog',
      source_type: 'SYSLOG',
      endpoint: null,
      ingestion_method: 'FILE',
      authentication_type: null,
      status: 'ACTIVE',
      description: null,
      created_by: securityOfficerId,
      created_at: now,
      updated_at: now,
      event_source_families: [{ event_family: 'APPLICATION_ACCESS' }],
    });

    const result = await eventSourcesService.registerEventSource(securityOfficerId, {
      name: 'Batch Syslog',
      sourceType: 'SYSLOG',
      ingestionMethod: 'FILE',
      status: 'ACTIVE',
      eventFamilies: ['APPLICATION_ACCESS'],
    });

    expect(result.id).toBe('source-456');
    expect(result.ingestionMethod).toBe('FILE');
  });

  it('rejects unauthorized roles like EMPLOYEE', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: employeeId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });

    await expect(
      eventSourcesService.registerEventSource(employeeId, {
        name: 'Test Source',
        sourceType: 'WAZUH',
        endpoint: 'https://wazuh.local',
        ingestionMethod: 'API',
        status: 'ACTIVE',
        eventFamilies: ['AUTHENTICATION'],
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });

    expect(eventSourcesRepository.create).not.toHaveBeenCalled();
  });

  it('rejects inactive users', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN',
      status: 'INACTIVE',
    });

    await expect(
      eventSourcesService.registerEventSource(adminId, {
        name: 'Test Source',
        sourceType: 'WAZUH',
        endpoint: 'https://wazuh.local',
        ingestionMethod: 'API',
        status: 'ACTIVE',
        eventFamilies: ['AUTHENTICATION'],
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });
});
