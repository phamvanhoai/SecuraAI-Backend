import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  auditCreateMock,
  countMock,
  createMock,
  findManyMock,
  findUniqueMock,
  transactionMock,
  updateMock,
  eventFindManyMock,
  eventCreateManyAndReturnMock,
} = vi.hoisted(() => ({
  auditCreateMock: vi.fn(),
  countMock: vi.fn(),
  createMock: vi.fn(),
  findManyMock: vi.fn(),
  findUniqueMock: vi.fn(),
  transactionMock: vi.fn(),
  updateMock: vi.fn(),
  eventFindManyMock: vi.fn(),
  eventCreateManyAndReturnMock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    assets: { findFirst: vi.fn() },
    integrations: { findFirst: vi.fn() },
    log_sources: { count: countMock, findMany: findManyMock },
    $transaction: transactionMock,
  },
}));

import { securityMonitoringRepository } from '../src/modules/security-monitoring/security-monitoring.repository.js';

const sourceRecord = {
  log_source_id: 'source-1',
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

describe('securityMonitoringRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockResolvedValue(2);
    findManyMock.mockResolvedValue([]);
  });

  it('uses bounded pagination and stable allow-listed sorting', async () => {
    transactionMock.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    await securityMonitoringRepository.listLogSources({
      page: 2,
      limit: 10,
      q: 'auth',
      status: 'active',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'active',
          name: { contains: 'auth', mode: 'insensitive' },
        },
        orderBy: [{ updated_at: 'desc' }, { log_source_id: 'asc' }],
        skip: 10,
        take: 10,
      }),
    );
  });

  it('creates a source and audit entry atomically', async () => {
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({ log_sources: { create: createMock }, audit_logs: { create: auditCreateMock } }),
    );
    createMock.mockResolvedValue(sourceRecord);
    await securityMonitoringRepository.createLogSource(
      {
        name: 'Auth logs',
        sourceType: 'authentication',
        configuration: { format: 'json', timezone: 'UTC', collectRawPayload: true },
        status: 'active',
      },
      { actorUserId: 'user-1', ipAddress: null, userAgent: null },
    );
    const createArgument: unknown = createMock.mock.calls[0]?.[0];
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(createArgument).toMatchObject({
      data: { source_type: 'authentication', created_by_user_id: 'user-1' },
    });
    expect(auditArgument).toMatchObject({ data: { action: 'log_source.created' } });
  });

  it('updates and audits in one transaction or returns null', async () => {
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        log_sources: { findUnique: findUniqueMock, update: updateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
    findUniqueMock.mockResolvedValueOnce(null);
    await expect(
      securityMonitoringRepository.updateLogSource(
        'source-1',
        { status: 'inactive' },
        { actorUserId: 'user-1', ipAddress: null, userAgent: null },
      ),
    ).resolves.toBeNull();

    findUniqueMock.mockResolvedValueOnce({
      log_source_id: 'source-1',
      name: 'Auth logs',
      status: 'active',
      asset_id: null,
      integration_id: null,
      configuration: { format: 'json' },
    });
    updateMock.mockResolvedValue({ ...sourceRecord, status: 'inactive' });
    await securityMonitoringRepository.updateLogSource(
      'source-1',
      { status: 'inactive' },
      { actorUserId: 'user-1', ipAddress: null, userAgent: null },
    );
    const updateArgument: unknown = updateMock.mock.calls[0]?.[0];
    expect(updateArgument).toMatchObject({ data: { status: 'inactive' } });
    expect(auditCreateMock).toHaveBeenCalledOnce();
  });

  it('deduplicates event IDs and persists events, source timestamp and audit atomically', async () => {
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        log_sources: { findUnique: findUniqueMock, update: updateMock },
        security_events: {
          findMany: eventFindManyMock,
          createManyAndReturn: eventCreateManyAndReturnMock,
        },
        audit_logs: { create: auditCreateMock },
      }),
    );
    findUniqueMock.mockResolvedValue({
      log_source_id: 'source-1',
      asset_id: null,
      status: 'active',
    });
    eventFindManyMock.mockResolvedValue([
      {
        security_event_id: 'existing-event',
        log_source_id: 'source-1',
        external_event_id: 'existing',
        event_type: 'login.failed',
        event_time: new Date('2026-09-08T00:00:00Z'),
        source_ip: null,
      },
    ]);
    eventCreateManyAndReturnMock.mockResolvedValue([
      {
        security_event_id: 'event-1',
        log_source_id: 'source-1',
        event_type: 'login.failed',
        event_time: new Date('2026-09-08T00:00:00Z'),
        source_ip: null,
      },
    ]);
    const base = {
      eventType: 'login.failed',
      severity: 'high' as const,
      eventTime: new Date('2026-09-08T00:00:00Z'),
      sourceIp: null,
      destinationIp: null,
      rawPayload: null,
      normalizedData: { eventType: 'login.failed' },
    };
    const result = await securityMonitoringRepository.ingestSecurityEvents(
      'source-1',
      [
        { ...base, externalEventId: 'existing' },
        { ...base, externalEventId: 'new' },
        { ...base, externalEventId: 'new' },
      ],
      { actorUserId: 'user-1', ipAddress: null, userAgent: null },
    );
    expect(result).toEqual({
      ingested: 1,
      duplicates: 2,
      eventsForDetection: [
        expect.objectContaining({ id: 'existing-event', eventType: 'login.failed' }),
        expect.objectContaining({ id: 'event-1', eventType: 'login.failed' }),
      ],
    });
    expect(eventCreateManyAndReturnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ external_event_id: 'new', log_source_id: 'source-1' })],
      }),
    );
    expect(updateMock).toHaveBeenCalledOnce();
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(auditArgument).toMatchObject({ data: { action: 'security_events.ingested' } });
  });
});
