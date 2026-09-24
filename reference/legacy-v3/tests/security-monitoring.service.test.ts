import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createMock,
  deleteMock,
  findAssetMock,
  findIntegrationMock,
  findIngestionSourceMock,
  ingestMock,
  listMock,
  updateMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  deleteMock: vi.fn(),
  findAssetMock: vi.fn(),
  findIntegrationMock: vi.fn(),
  findIngestionSourceMock: vi.fn(),
  ingestMock: vi.fn(),
  listMock: vi.fn(),
  updateMock: vi.fn(),
}));

const { detectAlertsMock } = vi.hoisted(() => ({ detectAlertsMock: vi.fn() }));

vi.mock('../src/modules/ai-alerts/ai-alerts.service.js', () => ({
  aiAlertsService: { detectAlertsForEvents: detectAlertsMock },
}));

vi.mock('../src/modules/security-monitoring/security-monitoring.repository.js', () => ({
  securityMonitoringRepository: {
    createLogSource: createMock,
    deleteLogSource: deleteMock,
    findActiveAsset: findAssetMock,
    findUsableIntegration: findIntegrationMock,
    findLogSourceForIngestion: findIngestionSourceMock,
    ingestSecurityEvents: ingestMock,
    listLogSources: listMock,
    updateLogSource: updateMock,
  },
}));

import { securityMonitoringService } from '../src/modules/security-monitoring/security-monitoring.service.js';

const sourceRecord = {
  log_source_id: '00000000-0000-4000-8000-000000000010',
  name: 'Auth logs',
  source_type: 'authentication',
  configuration: { format: 'json' },
  status: 'active',
  last_received_at: null,
  created_at: new Date('2026-09-08T00:00:00.000Z'),
  updated_at: new Date('2026-09-08T00:00:00.000Z'),
  assets: null,
  integrations: null,
};

describe('securityMonitoringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ items: [sourceRecord], total: 1 });
    createMock.mockResolvedValue(sourceRecord);
    deleteMock.mockResolvedValue({ kind: 'deleted' });
    updateMock.mockResolvedValue(sourceRecord);
    findAssetMock.mockResolvedValue({ asset_id: 'asset-1' });
    findIntegrationMock.mockResolvedValue({ integration_id: 'integration-1' });
    findIngestionSourceMock.mockResolvedValue({
      log_source_id: 'source-1',
      status: 'active',
      configuration: { format: 'json' },
    });
    ingestMock.mockResolvedValue({
      ingested: 1,
      duplicates: 0,
      eventsForDetection: [
        {
          id: 'event-1',
          logSourceId: 'source-1',
          assetId: null,
          eventType: 'login.failed',
          eventTime: new Date('2026-09-08T00:00:00Z'),
          sourceIp: null,
        },
      ],
    });
    detectAlertsMock.mockResolvedValue({ alertsCreated: 1 });
  });

  it('requires read permission and returns pagination', async () => {
    const query = { page: 1, limit: 20, sortBy: 'name', sortOrder: 'asc' } as const;
    await expect(
      securityMonitoringService.listLogSources(query, { userId: 'user-1', permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    await expect(
      securityMonitoringService.listLogSources(query, {
        userId: 'user-1',
        permissions: ['log-sources.read'],
      }),
    ).resolves.toMatchObject({ pagination: { total: 1, totalPages: 1 } });
  });

  it('validates related records before creating a source', async () => {
    findAssetMock.mockResolvedValue(null);
    await expect(
      securityMonitoringService.createLogSource(
        {
          name: 'Auth logs',
          sourceType: 'authentication',
          assetId: '00000000-0000-4000-8000-000000000001',
          configuration: { format: 'json', timezone: 'UTC', collectRawPayload: true },
          status: 'active',
        },
        { userId: 'user-1', permissions: ['log-sources.manage'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates and maps a safe source response', async () => {
    const result = await securityMonitoringService.createLogSource(
      {
        name: 'Auth logs',
        sourceType: 'authentication',
        configuration: { format: 'json', timezone: 'UTC', collectRawPayload: true },
        status: 'active',
      },
      { userId: 'user-1', permissions: ['log-sources.manage'] },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    expect(result).toMatchObject({ id: sourceRecord.log_source_id, sourceType: 'authentication' });
    expect(createMock).toHaveBeenCalledWith(expect.any(Object), {
      actorUserId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });
  });

  it('returns 404 when updating a missing source', async () => {
    updateMock.mockResolvedValue(null);
    await expect(
      securityMonitoringService.updateLogSource(
        '00000000-0000-4000-8000-000000000010',
        { status: 'inactive' },
        { userId: 'user-1', permissions: ['log-sources.manage'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'LOG_SOURCE_NOT_FOUND' });
  });

  it('deletes only unused log sources with manage permission', async () => {
    const context = { ipAddress: null, userAgent: null };
    await expect(
      securityMonitoringService.deleteLogSource(
        sourceRecord.log_source_id,
        { userId: 'user-1', permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    deleteMock.mockResolvedValueOnce({ kind: 'not_found' });
    await expect(
      securityMonitoringService.deleteLogSource(
        sourceRecord.log_source_id,
        { userId: 'user-1', permissions: ['log-sources.manage'] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'LOG_SOURCE_NOT_FOUND' });

    deleteMock.mockResolvedValueOnce({
      kind: 'blocked',
      dependencies: { securityEvents: 2, aiAlerts: 1 },
    });
    await expect(
      securityMonitoringService.deleteLogSource(
        sourceRecord.log_source_id,
        { userId: 'user-1', permissions: ['log-sources.manage'] },
        context,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'LOG_SOURCE_HAS_DEPENDENCIES',
      details: { securityEvents: 2, aiAlerts: 1 },
    });
  });

  it('normalizes and ingests events only with the ingest permission', async () => {
    const input = {
      events: [
        { externalEventId: 'evt-1', eventType: 'login.failed', timestamp: '2026-09-08T00:00:00Z' },
      ],
    };
    await expect(
      securityMonitoringService.ingestSecurityEvents(
        '00000000-0000-4000-8000-000000000010',
        input,
        { userId: 'user-1', permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      securityMonitoringService.ingestSecurityEvents(
        '00000000-0000-4000-8000-000000000010',
        input,
        { userId: 'user-1', permissions: ['security-events.ingest'] },
        { ipAddress: null, userAgent: null },
      ),
    ).resolves.toEqual({ received: 1, ingested: 1, duplicates: 0, alertsCreated: 1 });
    expect(ingestMock).toHaveBeenCalledWith(
      expect.any(String),
      [expect.objectContaining({ eventType: 'login.failed', externalEventId: 'evt-1' })],
      expect.objectContaining({ actorUserId: 'user-1' }),
    );
    expect(detectAlertsMock).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'event-1' })],
      expect.objectContaining({ actorUserId: 'user-1' }),
    );
  });

  it('rejects ingestion for missing or inactive sources', async () => {
    findIngestionSourceMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'inactive', configuration: { format: 'json' } });
    const input = {
      events: [{ eventType: 'login', timestamp: '2026-09-08T00:00:00Z' }],
    };
    const actor = { userId: 'user-1', permissions: ['security-events.ingest'] };
    const context = { ipAddress: null, userAgent: null };
    await expect(
      securityMonitoringService.ingestSecurityEvents(
        '00000000-0000-4000-8000-000000000010',
        input,
        actor,
        context,
      ),
    ).rejects.toMatchObject({ code: 'LOG_SOURCE_NOT_FOUND' });
    await expect(
      securityMonitoringService.ingestSecurityEvents(
        '00000000-0000-4000-8000-000000000010',
        input,
        actor,
        context,
      ),
    ).rejects.toMatchObject({ code: 'LOG_SOURCE_INACTIVE' });
  });
});
