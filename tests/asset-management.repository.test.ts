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
  assetLookupMock,
  assetFindUniqueMock,
  historyCountMock,
  historyFindManyMock,
  departmentFindManyMock,
  userFindManyMock,
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
  assetLookupMock: vi.fn(),
  assetFindUniqueMock: vi.fn(),
  historyCountMock: vi.fn(),
  historyFindManyMock: vi.fn(),
  departmentFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    assets: {
      count: countMock,
      findFirst: assetLookupMock,
      findMany: findManyMock,
      findUnique: assetFindUniqueMock,
    },
    asset_change_history: { count: historyCountMock, findMany: historyFindManyMock },
    departments: { findUnique: vi.fn(), findMany: departmentFindManyMock },
    users: { findFirst: vi.fn(), findMany: userFindManyMock },
    audit_logs: { create: auditCreateMock },
    $transaction: transactionMock,
  },
}));

import { assetManagementRepository } from '../src/modules/asset-management/asset-management.repository.js';

describe('assetManagementRepository.listCreateOptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only bounded active departments and non-deleted active owners', async () => {
    departmentFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);

    await expect(assetManagementRepository.listCreateOptions()).resolves.toEqual({
      departments: [],
      owners: [],
      departmentsTruncated: false,
      ownersTruncated: false,
    });
    expect(departmentFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'active' }, take: 201 }),
    );
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'active', deleted_at: null }, take: 201 }),
    );
  });
});

describe('assetManagementRepository.findById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetLookupMock.mockResolvedValue(null);
  });

  it('treats soft-deleted assets as not found', async () => {
    await expect(assetManagementRepository.findById('asset-1')).resolves.toBeNull();
    expect(assetLookupMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { asset_id: 'asset-1', deleted_at: null } }),
    );
  });
});

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

describe('assetManagementRepository.classifyCriticality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        assets: { update: assetUpdateMock },
        asset_change_history: { create: historyCreateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
  });

  it('updates the asset and always records classification history and audit', async () => {
    const classifiedAt = new Date('2026-09-08T08:00:00.000Z');
    await assetManagementRepository.classifyCriticality(
      'asset-1',
      {
        previousCriticality: 'medium',
        criticality: 'critical',
        score: 4.55,
        changed: true,
        classifiedAt,
        criteria: {
          confidentialityImpact: 4,
          integrityImpact: 5,
          availabilityImpact: 5,
          businessImpact: 4,
        },
        reason: 'Production customer database',
      },
      { actorUserId: 'user-1', ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    const updateArgument: unknown = assetUpdateMock.mock.calls[0]?.[0];
    const historyArgument: unknown = historyCreateMock.mock.calls[0]?.[0];
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(updateArgument).toMatchObject({
      where: { asset_id: 'asset-1', deleted_at: null },
      data: { criticality: 'critical', updated_at: classifiedAt },
    });
    expect(historyArgument).toMatchObject({
      data: {
        action: 'classified',
        before_data: { criticality: 'medium' },
        after_data: { criticality: 'critical', score: 4.55, changed: true },
      },
    });
    expect(auditArgument).toMatchObject({
      data: { action: 'asset.criticality_classified', entity_id: 'asset-1' },
    });
  });

  it('records history and audit without updating when the result is unchanged', async () => {
    await assetManagementRepository.classifyCriticality(
      'asset-1',
      {
        previousCriticality: 'medium',
        criticality: 'medium',
        score: 2.5,
        changed: false,
        classifiedAt: new Date('2026-09-08T08:00:00.000Z'),
        criteria: {
          confidentialityImpact: 2,
          integrityImpact: 2,
          availabilityImpact: 3,
          businessImpact: 3,
        },
        reason: 'Periodic review',
      },
      { actorUserId: 'user-1', ipAddress: null, userAgent: null },
    );

    expect(assetUpdateMock).not.toHaveBeenCalled();
    expect(historyCreateMock).toHaveBeenCalledOnce();
    expect(auditCreateMock).toHaveBeenCalledOnce();
  });
});

describe('assetManagementRepository.assignOwner', () => {
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

  it.each([
    ['owner_assigned', null, 'owner-1'],
    ['owner_reassigned', 'owner-old', 'owner-1'],
    ['owner_unassigned', 'owner-old', null],
  ] as const)('atomically records %s', async (action, previousOwnerId, ownerUserId) => {
    const assignedAt = new Date('2026-09-08T10:00:00.000Z');
    await assetManagementRepository.assignOwner(
      'asset-1',
      {
        ownerUserId,
        reason: 'Responsibility changed',
        previousOwnerId,
        action,
        assignedAt,
      },
      { actorUserId: 'user-1', ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    const updateArgument: unknown = assetUpdateMock.mock.calls[0]?.[0];
    const historyArgument: unknown = historyCreateMock.mock.calls[0]?.[0];
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(updateArgument).toMatchObject({
      where: { asset_id: 'asset-1', deleted_at: null, owner_user_id: previousOwnerId },
      data: { owner_user_id: ownerUserId, updated_at: assignedAt },
    });
    expect(historyArgument).toMatchObject({
      data: {
        action,
        before_data: { ownerUserId: previousOwnerId },
        after_data: { ownerUserId, reason: 'Responsibility changed' },
      },
    });
    expect(auditArgument).toMatchObject({
      data: { action: `asset.${action}`, entity_id: 'asset-1' },
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
      },
      { actorUserId: 'user-1', ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    const assetCreateArgument: unknown = assetCreateMock.mock.calls[0]?.[0];
    const historyCreateArgument: unknown = historyCreateMock.mock.calls[0]?.[0];
    const auditCreateArgument: unknown = auditCreateMock.mock.calls[0]?.[0];

    expect(assetCreateArgument).toMatchObject({
      data: {
        asset_code: 'AST-001',
        criticality: 'medium',
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

describe('assetManagementRepository.importAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        assets: { create: assetCreateMock },
        asset_change_history: { create: historyCreateMock },
        audit_logs: { create: auditCreateMock },
      }),
    );
    assetCreateMock.mockResolvedValue({ asset_id: 'asset-import-1' });
  });

  it('atomically creates the asset with imported history and audit context', async () => {
    await assetManagementRepository.importAsset(
      {
        assetCode: 'AST-IMPORT-001',
        name: 'Imported Server',
        assetType: 'server',
        criticality: 'medium',
      },
      {
        actorUserId: 'user-1',
        importJobId: 'job-1',
        rowNumber: 2,
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      },
    );

    const assetArgument: unknown = assetCreateMock.mock.calls[0]?.[0];
    const historyArgument: unknown = historyCreateMock.mock.calls[0]?.[0];
    const auditArgument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(assetArgument).toMatchObject({
      data: { asset_code: 'AST-IMPORT-001', status: 'active' },
    });
    expect(historyArgument).toMatchObject({ data: { action: 'imported' } });
    expect(auditArgument).toMatchObject({
      data: { action: 'asset.imported', entity_id: 'asset-import-1' },
    });
  });
});

describe('assetManagementRepository asset export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue([]);
    auditCreateMock.mockResolvedValue({ audit_log_id: 'audit-1' });
  });

  it('reuses safe filters, excludes deleted assets and applies the hard query limit', async () => {
    await assetManagementRepository.findForExport(
      {
        q: 'server',
        status: 'active',
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
      10_001,
    );

    const argument: unknown = findManyMock.mock.calls[0]?.[0];
    expect(argument).toMatchObject({
      where: {
        deleted_at: null,
        status: 'active',
        OR: [
          { asset_code: { contains: 'server', mode: 'insensitive' } },
          { name: { contains: 'server', mode: 'insensitive' } },
          { hostname: { contains: 'server', mode: 'insensitive' } },
          { location: { contains: 'server', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ updated_at: 'desc' }, { asset_id: 'asc' }],
      take: 10_001,
    });
  });

  it('records only the export summary and filters in the audit log', async () => {
    await assetManagementRepository.recordExport(
      {
        format: 'xlsx',
        exportedRows: 2,
        filters: { status: 'active', sortBy: 'assetCode', sortOrder: 'asc' },
      },
      { actorUserId: 'user-1', ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    const argument: unknown = auditCreateMock.mock.calls[0]?.[0];
    expect(argument).toMatchObject({
      data: {
        actor_user_id: 'user-1',
        action: 'asset.exported',
        entity_type: 'asset_export',
        after_data: { format: 'xlsx', exportedRows: 2, filters: { status: 'active' } },
      },
    });
  });
});

describe('assetManagementRepository.listHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    historyCountMock.mockResolvedValue(1);
    historyFindManyMock.mockResolvedValue([]);
    transactionMock.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('finds assets including soft-deleted records', async () => {
    assetFindUniqueMock.mockResolvedValue(null);
    await assetManagementRepository.findAssetForHistory('asset-1');

    const argument: unknown = assetFindUniqueMock.mock.calls[0]?.[0];
    expect(argument).toMatchObject({ where: { asset_id: 'asset-1' } });
    expect(argument).not.toMatchObject({ where: { deleted_at: null } });
  });

  it('applies filters, inclusive dates, pagination and deterministic sorting', async () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');
    await assetManagementRepository.listHistory('asset-1', {
      page: 2,
      limit: 10,
      action: 'updated',
      changedByUserId: '00000000-0000-4000-8000-000000000001',
      from,
      to,
      sortOrder: 'asc',
    });

    const argument: unknown = historyFindManyMock.mock.calls[0]?.[0];
    expect(argument).toMatchObject({
      where: {
        asset_id: 'asset-1',
        action: 'updated',
        changed_by_user_id: '00000000-0000-4000-8000-000000000001',
        changed_at: { gte: from, lte: to },
      },
      orderBy: [{ changed_at: 'asc' }, { asset_change_history_id: 'asc' }],
      skip: 10,
      take: 10,
    });
  });
});
