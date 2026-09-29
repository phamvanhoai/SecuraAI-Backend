import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/common/errors/app-error.js';
import { eventSourcesRepository } from '../src/modules/event-ingestion/event-sources.repository.js';
import { eventSourcesService } from '../src/modules/event-ingestion/event-sources.service.js';
import { wazuhConnectionTester } from '../src/modules/event-ingestion/connectors/wazuh-connection-tester.js';

vi.mock('../src/modules/event-ingestion/event-sources.repository.js', () => ({
  eventSourcesRepository: {
    findActor: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../src/modules/event-ingestion/connectors/wazuh-connection-tester.js', () => ({
  wazuhConnectionTester: {
    testConnection: vi.fn(),
  },
}));

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const sourceId = '3a9bf33a-02db-48e4-a8ad-90517278d7f3';

const mockDiagnosticResult = {
  connected: true,
  statusCode: 200,
  latencyMs: 145,
  message: 'Wazuh API connected and authenticated successfully',
  provider: 'wazuh',
  details: {
    title: 'Wazuh REST API',
    apiVersion: 'v4.8.0',
    hostname: 'wazuh-manager-01',
  },
  verifySslWarning: false,
};

describe('eventSourcesService.testConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to wazuhConnectionTester and returns diagnostic results for ADMIN', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(wazuhConnectionTester.testConnection).mockResolvedValue(mockDiagnosticResult);

    const result = await eventSourcesService.testConnection(userId, {
      endpoint: 'https://192.168.56.101:55000',
      username: 'wazuh-wui',
      password: 'password123',
      verifySsl: true,
      timeoutMs: 5000,
    });

    expect(result).toEqual(mockDiagnosticResult);
    expect(wazuhConnectionTester.testConnection).toHaveBeenCalledWith({
      endpoint: 'https://192.168.56.101:55000',
      username: 'wazuh-wui',
      password: 'password123',
      verifySsl: true,
      timeoutMs: 5000,
    });
  });

  it('rejects unauthorized actor roles', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });

    await expect(
      eventSourcesService.testConnection(userId, {
        endpoint: 'https://192.168.56.101:55000',
        verifySsl: true,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(AppError);
  });
});

describe('eventSourcesService.testConnectionById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches existing source endpoint and tests connection', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue({
      id: sourceId,
      name: 'Wazuh Production SIEM',
      source_type: 'WAZUH',
      endpoint: 'https://wazuh.internal:55000',
      ingestion_method: 'API',
      authentication_type: 'API_KEY',
      status: 'ACTIVE',
      description: null,
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
      event_source_families: [],
      users: { id: userId, email: 'admin@secura.ai', full_name: 'Security Admin' },
      integration_api_keys: [],
      _count: { normalized_events: 0, event_ingestion_batches: 0 },
      event_ingestion_batches: [],
    });
    vi.mocked(wazuhConnectionTester.testConnection).mockResolvedValue(mockDiagnosticResult);

    const result = await eventSourcesService.testConnectionById(userId, sourceId, {
      username: 'wazuh',
      password: 'new_password',
      verifySsl: false,
      timeoutMs: 6000,
    });

    expect(result).toEqual(mockDiagnosticResult);
    expect(wazuhConnectionTester.testConnection).toHaveBeenCalledWith({
      endpoint: 'https://wazuh.internal:55000',
      username: 'wazuh',
      password: 'new_password',
      verifySsl: false,
      timeoutMs: 6000,
    });
  });

  it('throws 404 if event source is not found', async () => {
    vi.mocked(eventSourcesRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventSourcesRepository.findById).mockResolvedValue(null);

    await expect(
      eventSourcesService.testConnectionById(userId, sourceId, { timeoutMs: 5000 }),
    ).rejects.toThrow(new AppError(404, 'NOT_FOUND', 'Event source not found'));
  });
});
