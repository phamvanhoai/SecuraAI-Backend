import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAssetMock,
  findByCodeMock,
  findDepartmentByIdMock,
  findByIdMock,
  findOwnerByIdMock,
  listAssetsMock,
  softDeleteMock,
  updateAssetMock,
} = vi.hoisted(() => ({
  createAssetMock: vi.fn(),
  findByCodeMock: vi.fn(),
  findDepartmentByIdMock: vi.fn(),
  findByIdMock: vi.fn(),
  findOwnerByIdMock: vi.fn(),
  listAssetsMock: vi.fn(),
  softDeleteMock: vi.fn(),
  updateAssetMock: vi.fn(),
}));

vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: {
    create: createAssetMock,
    findByCode: findByCodeMock,
    findById: findByIdMock,
    findDepartmentById: findDepartmentByIdMock,
    findOwnerById: findOwnerByIdMock,
    list: listAssetsMock,
    softDelete: softDeleteMock,
    update: updateAssetMock,
  },
}));

import { assetManagementService } from '../src/modules/asset-management/asset-management.service.js';

const query = {
  page: 1,
  limit: 20,
  sortBy: 'assetCode',
  sortOrder: 'asc',
} as const;

describe('assetManagementService.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects callers without the assets.read permission', async () => {
    await expect(
      assetManagementService.list(query, { userId: 'user-1', permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(listAssetsMock).not.toHaveBeenCalled();
  });

  it('maps safe asset summaries and pagination metadata', async () => {
    listAssetsMock.mockResolvedValue({
      total: 21,
      items: [
        {
          asset_id: 'asset-1',
          asset_code: 'AST-001',
          name: 'Database Server',
          asset_type: 'server',
          criticality: 'critical',
          status: 'active',
          location: null,
          updated_at: new Date('2026-09-06T10:00:00.000Z'),
          departments: { department_id: 'department-1', code: 'IT', name: 'IT' },
          users_assets_owner_user_idTousers: { user_id: 'user-1', full_name: 'Owner' },
        },
      ],
    });

    const result = await assetManagementService.list(query, {
      userId: 'user-1',
      permissions: ['assets.read'],
    });

    expect(result).toEqual({
      items: [
        {
          id: 'asset-1',
          assetCode: 'AST-001',
          name: 'Database Server',
          assetType: 'server',
          criticality: 'critical',
          status: 'active',
          location: null,
          department: { id: 'department-1', code: 'IT', name: 'IT' },
          owner: { id: 'user-1', fullName: 'Owner' },
          updatedAt: new Date('2026-09-06T10:00:00.000Z'),
        },
      ],
      pagination: { page: 1, limit: 20, total: 21, totalPages: 2 },
    });
  });
});

const existingAsset = {
  asset_id: '00000000-0000-4000-8000-000000000010',
  asset_code: 'AST-001',
  name: 'Database Server',
  asset_type: 'server',
  description: null,
  department_id: null,
  owner_user_id: null,
  criticality: 'medium',
  hostname: 'db-01',
  ip_address: '192.168.1.10',
  location: 'Server Room',
  status: 'active',
  metadata: {},
  retired_at: null,
  created_at: new Date('2026-09-07T10:00:00.000Z'),
  updated_at: new Date('2026-09-07T10:00:00.000Z'),
  departments: null,
  users_assets_owner_user_idTousers: null,
};

describe('assetManagementService.update', () => {
  const actor = { userId: 'user-1', permissions: ['assets.update'] };
  const context = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue(existingAsset);
    updateAssetMock.mockImplementation((_assetId: string, changes: Record<string, unknown>) =>
      Promise.resolve({
        ...existingAsset,
        name: changes.name ?? existingAsset.name,
        status: changes.status ?? existingAsset.status,
      }),
    );
  });

  it('requires permission and an existing non-deleted asset', async () => {
    await expect(
      assetManagementService.update(
        existingAsset.asset_id,
        { name: 'New' },
        { userId: 'u', permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    findByIdMock.mockResolvedValue(null);
    await expect(
      assetManagementService.update(existingAsset.asset_id, { name: 'New' }, actor, context),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });
  });

  it('does not write history or audit for identical values', async () => {
    const result = await assetManagementService.update(
      existingAsset.asset_id,
      { name: existingAsset.name, metadata: {} },
      actor,
      context,
    );

    expect(result.name).toBe(existingAsset.name);
    expect(updateAssetMock).not.toHaveBeenCalled();
  });

  it('rejects updates to disposed assets and invalid status transitions', async () => {
    findByIdMock.mockResolvedValueOnce({ ...existingAsset, status: 'disposed' });
    await expect(
      assetManagementService.update(existingAsset.asset_id, { name: 'New' }, actor, context),
    ).rejects.toMatchObject({ code: 'ASSET_DISPOSED' });

    findByIdMock.mockResolvedValueOnce({ ...existingAsset, status: 'retired' });
    await expect(
      assetManagementService.update(existingAsset.asset_id, { status: 'inactive' }, actor, context),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  it('sets retiredAt and records only changed values', async () => {
    await assetManagementService.update(
      existingAsset.asset_id,
      { name: 'Retired Database', status: 'retired' },
      actor,
      context,
    );

    const calledAssetId: unknown = updateAssetMock.mock.calls[0]?.[0];
    const calledChanges: unknown = updateAssetMock.mock.calls[0]?.[1];
    const calledContext: unknown = updateAssetMock.mock.calls[0]?.[2];
    expect(calledAssetId).toBe(existingAsset.asset_id);
    expect(calledChanges).toMatchObject({
      name: 'Retired Database',
      status: 'retired',
    });
    expect(calledContext).toMatchObject({
      actorUserId: 'user-1',
      beforeData: {
        name: 'Database Server',
        status: 'active',
        retiredAt: null,
      },
      afterData: { name: 'Retired Database', status: 'retired' },
    });
  });
});

describe('assetManagementService.delete', () => {
  const actor = { userId: 'user-1', permissions: ['assets.delete'] };
  const context = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

  beforeEach(() => vi.clearAllMocks());

  it('requires assets.delete', async () => {
    await expect(
      assetManagementService.delete('asset-1', { userId: 'user-1', permissions: [] }, context),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('returns not found for missing or already-deleted assets', async () => {
    softDeleteMock.mockResolvedValue({ kind: 'not_found' });
    await expect(assetManagementService.delete('asset-1', actor, context)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ASSET_NOT_FOUND',
    });
  });

  it('reports bounded dependency counts when deletion is blocked', async () => {
    const dependencies = {
      riskAssessments: 1,
      openAlerts: 0,
      activeLogSources: 1,
      enabledAlertThresholds: 0,
      openIncidents: 0,
    };
    softDeleteMock.mockResolvedValue({ kind: 'blocked', dependencies });

    await expect(assetManagementService.delete('asset-1', actor, context)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ASSET_HAS_ACTIVE_DEPENDENCIES',
      details: dependencies,
    });
  });

  it('completes when the repository soft-deletes the asset', async () => {
    softDeleteMock.mockResolvedValue({ kind: 'deleted' });
    await expect(assetManagementService.delete('asset-1', actor, context)).resolves.toBeUndefined();
    expect(softDeleteMock).toHaveBeenCalledWith('asset-1', {
      actorUserId: 'user-1',
      ...context,
    });
  });
});

describe('assetManagementService.create', () => {
  const actor = { userId: 'user-1', permissions: ['assets.create'] };
  const context = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
  const input = {
    assetCode: 'AST-001',
    name: 'Database Server',
    assetType: 'server',
    criticality: 'critical',
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    findByCodeMock.mockResolvedValue(null);
  });

  it('requires the assets.create permission', async () => {
    await expect(
      assetManagementService.create(input, { userId: 'user-1', permissions: [] }, context),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(findByCodeMock).not.toHaveBeenCalled();
  });

  it('rejects an existing asset code, including a soft-deleted asset', async () => {
    findByCodeMock.mockResolvedValue({ asset_id: 'asset-existing' });

    await expect(assetManagementService.create(input, actor, context)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ASSET_CODE_EXISTS',
    });
    expect(createAssetMock).not.toHaveBeenCalled();
  });

  it('rejects inactive related records', async () => {
    findDepartmentByIdMock.mockResolvedValue({ department_id: 'department-1', status: 'inactive' });

    await expect(
      assetManagementService.create({ ...input, departmentId: 'department-1' }, actor, context),
    ).rejects.toMatchObject({ statusCode: 422, code: 'DEPARTMENT_INACTIVE' });
  });

  it('creates and maps a safe asset response', async () => {
    createAssetMock.mockResolvedValue({
      asset_id: 'asset-1',
      asset_code: 'AST-001',
      name: 'Database Server',
      asset_type: 'server',
      criticality: 'critical',
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

    const result = await assetManagementService.create(input, actor, context);

    expect(createAssetMock).toHaveBeenCalledWith(input, {
      actorUserId: 'user-1',
      ...context,
    });
    expect(result).toMatchObject({ id: 'asset-1', assetCode: 'AST-001', status: 'active' });
    expect(result).not.toHaveProperty('metadata');
  });
});
