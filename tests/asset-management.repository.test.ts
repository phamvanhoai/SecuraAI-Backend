import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assetCreateMock,
  auditCreateMock,
  countMock,
  findManyMock,
  historyCreateMock,
  transactionMock,
  assetUpdateMock,
  assetFindFirstMock,
  riskCountMock,
  alertCountMock,
  logSourceCountMock,
  thresholdCountMock,
  incidentCountMock,
} = vi.hoisted(() => ({
  assetCreateMock: vi.fn(),
  auditCreateMock: vi.fn(),
  countMock: vi.fn(),
  findManyMock: vi.fn(),
  historyCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  assetUpdateMock: vi.fn(),
  assetFindFirstMock: vi.fn(),
  riskCountMock: vi.fn(),
  alertCountMock: vi.fn(),
  logSourceCountMock: vi.fn(),
  thresholdCountMock: vi.fn(),
  incidentCountMock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    assets: { count: countMock, findMany: findManyMock, findUnique: vi.fn() },
    departments: { findUnique: vi.fn() },
    users: { findFirst: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { assetManagementRepository } from '../src/modules/asset-management/asset-management.repository.js';

describe('assetManagementRepository.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockResolvedValue(3);
    findManyMock.mockResolvedValue([]);
    transactionMock.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('enforces soft deletion, filters, deterministic sorting and pagination', async () => {
    const result = await assetManagementRepository.list({
      page: 2,
      limit: 10,
      q: 'server',
      assetType: 'server',
      criticality: 'critical',
      status: 'active',
      departmentId: '00000000-0000-4000-8000-000000000001',
      ownerUserId: '00000000-0000-4000-8000-000000000002',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    const expectedWhere = {
      deleted_at: null,
      asset_type: 'server',
      criticality: 'critical',
      status: 'active',
      department_id: '00000000-0000-4000-8000-000000000001',
      owner_user_id: '00000000-0000-4000-8000-000000000002',
      OR: [
        { asset_code: { contains: 'server', mode: 'insensitive' } },
        { name: { contains: 'server', mode: 'insensitive' } },
        { hostname: { contains: 'server', mode: 'insensitive' } },
        { location: { contains: 'server', mode: 'insensitive' } },
      ],
    };

    expect(result).toEqual({ items: [], total: 3 });
    expect(countMock).toHaveBeenCalledWith({ where: expectedWhere });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        orderBy: [{ updated_at: 'desc' }, { asset_id: 'asc' }],
        skip: 10,
        take: 10,
      }),
    );
  });

  it.each([
    ['assetCode', 'asc', [{ asset_code: 'asc' }, { asset_id: 'asc' }]],
    ['name', 'desc', [{ name: 'desc' }, { asset_id: 'asc' }]],
    ['createdAt', 'asc', [{ created_at: 'asc' }, { asset_id: 'asc' }]],
    ['updatedAt', 'desc', [{ updated_at: 'desc' }, { asset_id: 'asc' }]],
  ] as const)(
    'maps sortBy=%s to an allow-listed stable database order',
    async (sortBy, sortOrder, expected) => {
      await assetManagementRepository.list({ page: 1, limit: 20, sortBy, sortOrder });

      const findManyArgument: unknown = findManyMock.mock.calls[0]?.[0];
      expect(findManyArgument).toMatchObject({ orderBy: expected });
    },
  );

  it('returns an empty result without treating it as not found', async () => {
    countMock.mockResolvedValue(0);
    findManyMock.mockResolvedValue([]);

    await expect(
      assetManagementRepository.list({
        page: 1,
        limit: 20,
        q: 'does-not-exist',
        sortBy: 'assetCode',
        sortOrder: 'asc',
      }),
    ).resolves.toEqual({ items: [], total: 0 });
  });
});

describe('assetManagementRepository.update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        assets: { update: assetUpdateMock },
        asset_change_history: { create: historyCreateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
    assetUpdateMock.mockResolvedValue({ asset_id: 'asset-1' });
  });

  it('updates and audits changed fields in one transaction', async () => {
    const beforeData = { name: 'Old name' };
    const afterData = { name: 'New name' };

    await assetManagementRepository.update(
      'asset-1',
      { name: 'New name', departmentId: null, retiredAt: null },
      {
        actorUserId: 'user-1',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        beforeData,
        afterData,
      },
    );

    const updateArgument: unknown = assetUpdateMock.mock.calls[0]?.[0];
    const historyArgument: unknown = historyCreateMock.mock.calls[0]?.[0];
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(updateArgument).toMatchObject({
      where: { asset_id: 'asset-1', deleted_at: null },
      data: { name: 'New name', department_id: null, retired_at: null },
    });
    expect(historyArgument).toMatchObject({
      data: { action: 'updated', before_data: beforeData, after_data: afterData },
    });
    expect(auditArgument).toMatchObject({
      data: { action: 'asset.updated', before_data: beforeData, after_data: afterData },
    });
  });
});

describe('assetManagementRepository.softDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        assets: { findFirst: assetFindFirstMock, update: assetUpdateMock },
        risk_assessments: { count: riskCountMock },
        ai_alerts: { count: alertCountMock },
        log_sources: { count: logSourceCountMock },
        asset_alert_thresholds: { count: thresholdCountMock },
        incident_alert_links: { count: incidentCountMock },
        asset_change_history: { create: historyCreateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
    assetFindFirstMock.mockResolvedValue({
      asset_id: 'asset-1',
      asset_code: 'AST-001',
      name: 'Server',
      status: 'active',
    });
    for (const countMock of [
      riskCountMock,
      alertCountMock,
      logSourceCountMock,
      thresholdCountMock,
      incidentCountMock,
    ]) {
      countMock.mockResolvedValue(0);
    }
  });

  it('does not write when an active dependency exists', async () => {
    riskCountMock.mockResolvedValue(2);

    const result = await assetManagementRepository.softDelete('asset-1', {
      actorUserId: 'user-1',
      ipAddress: null,
      userAgent: null,
    });

    expect(result).toMatchObject({ kind: 'blocked', dependencies: { riskAssessments: 2 } });
    expect(assetUpdateMock).not.toHaveBeenCalled();
    expect(historyCreateMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('soft-deletes and creates history and audit records atomically', async () => {
    const result = await assetManagementRepository.softDelete('asset-1', {
      actorUserId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    const updateArgument: unknown = assetUpdateMock.mock.calls[0]?.[0];
    const historyArgument: unknown = historyCreateMock.mock.calls[0]?.[0];
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(result).toEqual({ kind: 'deleted' });
    expect(updateArgument).toMatchObject({
      where: { asset_id: 'asset-1', deleted_at: null },
      data: { status: 'inactive' },
    });
    expect(historyArgument).toMatchObject({ data: { action: 'deleted', asset_id: 'asset-1' } });
    expect(auditArgument).toMatchObject({
      data: { action: 'asset.deleted', entity_id: 'asset-1' },
    });
  });
});

describe('assetManagementRepository.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        assets: { create: assetCreateMock },
        asset_change_history: { create: historyCreateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
    assetCreateMock.mockResolvedValue({
      asset_id: 'asset-1',
      asset_code: 'AST-001',
      name: 'Server',
      asset_type: 'server',
      criticality: 'medium',
      status: 'active',
      location: null,
      description: null,
      hostname: null,
      ip_address: null,
      created_at: new Date('2026-09-07T10:00:00.000Z'),
      updated_at: new Date('2026-09-07T10:00:00.000Z'),
      departments: null,
      users_assets_owner_user_idTousers: null,
    });
  });

  it('atomically writes the asset, change history and audit log', async () => {
    await assetManagementRepository.create(
      {
        assetCode: 'AST-001',
        name: 'Server',
        assetType: 'server',
        criticality: 'medium',
      },
      { actorUserId: 'user-1', ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    const assetCreateArgument: unknown = assetCreateMock.mock.calls[0]?.[0];
    const historyCreateArgument: unknown = historyCreateMock.mock.calls[0]?.[0];
    const auditCreateArgument: unknown = auditCreateMock.mock.calls[0]?.[0];

    expect(assetCreateArgument).toMatchObject({
      data: {
        asset_code: 'AST-001',
        status: 'active',
        created_by_user_id: 'user-1',
      },
    });
    expect(historyCreateArgument).toMatchObject({
      data: { asset_id: 'asset-1', action: 'created' },
    });
    expect(auditCreateArgument).toMatchObject({
      data: {
        actor_user_id: 'user-1',
        action: 'asset.created',
        entity_id: 'asset-1',
      },
    });
  });
});
