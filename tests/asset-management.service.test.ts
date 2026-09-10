import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAssetMock,
  classifyCriticalityMock,
  findByCodeMock,
  findDepartmentByIdMock,
  findByIdMock,
  findOwnerByIdMock,
  listAssetsMock,
  softDeleteMock,
  updateAssetMock,
  assignOwnerMock,
  findAssetForHistoryMock,
  listHistoryMock,
} = vi.hoisted(() => ({
  createAssetMock: vi.fn(),
  classifyCriticalityMock: vi.fn(),
  findByCodeMock: vi.fn(),
  findDepartmentByIdMock: vi.fn(),
  findByIdMock: vi.fn(),
  findOwnerByIdMock: vi.fn(),
  listAssetsMock: vi.fn(),
  softDeleteMock: vi.fn(),
  updateAssetMock: vi.fn(),
  assignOwnerMock: vi.fn(),
  findAssetForHistoryMock: vi.fn(),
  listHistoryMock: vi.fn(),
}));

vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: {
    assignOwner: assignOwnerMock,
    classifyCriticality: classifyCriticalityMock,
    create: createAssetMock,
    findByCode: findByCodeMock,
    findById: findByIdMock,
    findDepartmentById: findDepartmentByIdMock,
    findOwnerById: findOwnerByIdMock,
    list: listAssetsMock,
    softDelete: softDeleteMock,
    update: updateAssetMock,
    findAssetForHistory: findAssetForHistoryMock,
    listHistory: listHistoryMock,
  },
}));

import { assetManagementService } from '../src/modules/asset-management/asset-management.service.js';

const query = {
  page: 1,
  limit: 20,
  sortBy: 'assetCode',
  sortOrder: 'asc',
} as const;

describe('assetManagementService.listHistory', () => {
  const historyQuery = { page: 1, limit: 20, sortOrder: 'desc' as const };

  beforeEach(() => vi.clearAllMocks());

  it('requires permission and returns 404 only when the asset never existed', async () => {
    await expect(
      assetManagementService.listHistory('asset-1', historyQuery, {
        userId: 'user-1',
        permissions: [],
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    findAssetForHistoryMock.mockResolvedValue(null);
    await expect(
      assetManagementService.listHistory('asset-1', historyQuery, {
        userId: 'user-1',
        permissions: ['assets.history.read'],
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });
  });

  it('returns deleted assets, pagination and sanitized history data', async () => {
    findAssetForHistoryMock.mockResolvedValue({
      asset_id: 'asset-1',
      asset_code: 'AST-001',
      name: 'Server',
      deleted_at: new Date('2026-09-09T00:00:00.000Z'),
    });
    listHistoryMock.mockResolvedValue({
      total: 21,
      items: [
        {
          asset_change_history_id: 'history-1',
          action: 'updated',
          before_data: { name: 'Old', password: 'hidden', unknown: 'removed' },
          after_data: {
            name: 'New',
            metadata: { environment: 'test', accessToken: 'hidden' },
          },
          changed_at: new Date('2026-09-09T10:00:00.000Z'),
          users: {
            user_id: 'deleted-user',
            full_name: 'Former User',
            deleted_at: new Date('2026-09-09T11:00:00.000Z'),
          },
        },
      ],
    });

    const result = await assetManagementService.listHistory('asset-1', historyQuery, {
      userId: 'user-1',
      permissions: ['assets.history.read'],
    });

    expect(result).toEqual({
      asset: { id: 'asset-1', assetCode: 'AST-001', name: 'Server', deleted: true },
      items: [
        {
          id: 'history-1',
          action: 'updated',
          changedBy: null,
          before: { name: 'Old' },
          after: { name: 'New', metadata: { environment: 'test' } },
          changedAt: new Date('2026-09-09T10:00:00.000Z'),
        },
      ],
      pagination: { page: 1, limit: 20, total: 21, totalPages: 2 },
    });
  });

  it('maps an active actor, null snapshots and an empty page correctly', async () => {
    findAssetForHistoryMock.mockResolvedValue({
      asset_id: 'asset-1',
      asset_code: 'AST-001',
      name: 'Server',
      deleted_at: null,
    });
    listHistoryMock.mockResolvedValueOnce({
      total: 1,
      items: [
        {
          asset_change_history_id: 'history-1',
          action: 'created',
          before_data: null,
          after_data: null,
          changed_at: new Date('2026-09-09T10:00:00.000Z'),
          users: { user_id: 'user-1', full_name: 'Administrator', deleted_at: null },
        },
      ],
    });
    const populated = await assetManagementService.listHistory('asset-1', historyQuery, {
      userId: 'user-1',
      permissions: ['assets.history.read'],
    });

    expect(populated.asset.deleted).toBe(false);
    expect(populated.items[0]).toMatchObject({
      changedBy: { id: 'user-1', fullName: 'Administrator' },
      before: null,
      after: null,
    });

    listHistoryMock.mockResolvedValueOnce({ total: 0, items: [] });
    const empty = await assetManagementService.listHistory('asset-1', historyQuery, {
      userId: 'user-1',
      permissions: ['assets.history.read'],
    });
    expect(empty.items).toEqual([]);
    expect(empty.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });
});

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

describe('assetManagementService.assignOwner', () => {
  const assetId = '00000000-0000-4000-8000-000000000010';
  const ownerId = '00000000-0000-4000-8000-000000000020';
  const actor = { userId: 'user-1', permissions: ['assets.assign-owner'] };
  const context = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue(existingAsset);
    findOwnerByIdMock.mockResolvedValue({
      user_id: ownerId,
      full_name: 'Asset Owner',
      status: 'active',
    });
    assignOwnerMock.mockResolvedValue({
      ...existingAsset,
      owner_user_id: ownerId,
      users_assets_owner_user_idTousers: { user_id: ownerId, full_name: 'Asset Owner' },
    });
  });

  it('requires assets.assign-owner and an existing usable asset', async () => {
    await expect(
      assetManagementService.assignOwner(
        assetId,
        { ownerUserId: ownerId, reason: 'Assign' },
        { userId: 'user-1', permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    findByIdMock.mockResolvedValueOnce(null);
    await expect(
      assetManagementService.assignOwner(
        assetId,
        { ownerUserId: ownerId, reason: 'Assign' },
        actor,
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });

    findByIdMock.mockResolvedValueOnce({ ...existingAsset, status: 'disposed' });
    await expect(
      assetManagementService.assignOwner(
        assetId,
        { ownerUserId: ownerId, reason: 'Assign' },
        actor,
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ASSET_DISPOSED' });
  });

  it('rejects a missing or inactive owner', async () => {
    findOwnerByIdMock.mockResolvedValueOnce(null);
    await expect(
      assetManagementService.assignOwner(
        assetId,
        { ownerUserId: ownerId, reason: 'Assign' },
        actor,
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_OWNER_NOT_FOUND' });

    findOwnerByIdMock.mockResolvedValueOnce({
      user_id: ownerId,
      full_name: 'Inactive Owner',
      status: 'inactive',
    });
    await expect(
      assetManagementService.assignOwner(
        assetId,
        { ownerUserId: ownerId, reason: 'Assign' },
        actor,
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ASSET_OWNER_INACTIVE' });
  });

  it('returns changed=false without writing when the owner is unchanged', async () => {
    const result = await assetManagementService.assignOwner(
      assetId,
      { ownerUserId: null, reason: 'No owner required' },
      actor,
      context,
    );

    expect(result).toEqual({
      assetId,
      previousOwner: null,
      owner: null,
      changed: false,
      assignedAt: null,
    });
    expect(assignOwnerMock).not.toHaveBeenCalled();
  });

  it('assigns, reassigns and unassigns with the correct business action', async () => {
    await assetManagementService.assignOwner(
      assetId,
      { ownerUserId: ownerId, reason: 'Initial assignment' },
      actor,
      context,
    );
    let assignment: unknown = assignOwnerMock.mock.calls[0]?.[1];
    expect(assignment).toMatchObject({ action: 'owner_assigned', previousOwnerId: null });

    const ownedAsset = {
      ...existingAsset,
      owner_user_id: '00000000-0000-4000-8000-000000000019',
      users_assets_owner_user_idTousers: {
        user_id: '00000000-0000-4000-8000-000000000019',
        full_name: 'Previous Owner',
      },
    };
    findByIdMock.mockResolvedValue(ownedAsset);
    await assetManagementService.assignOwner(
      assetId,
      { ownerUserId: ownerId, reason: 'Responsibility changed' },
      actor,
      context,
    );
    assignment = assignOwnerMock.mock.calls[1]?.[1];
    expect(assignment).toMatchObject({ action: 'owner_reassigned' });

    assignOwnerMock.mockResolvedValue({
      ...ownedAsset,
      owner_user_id: null,
      users_assets_owner_user_idTousers: null,
    });
    await assetManagementService.assignOwner(
      assetId,
      { ownerUserId: null, reason: 'Unassign responsibility' },
      actor,
      context,
    );
    assignment = assignOwnerMock.mock.calls[2]?.[1];
    expect(assignment).toMatchObject({ action: 'owner_unassigned' });
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

describe('assetManagementService.getById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires assets.read without revealing whether the asset exists', async () => {
    await expect(
      assetManagementService.getById(existingAsset.asset_id, {
        userId: 'user-1',
        permissions: [],
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the active asset cannot be found', async () => {
    findByIdMock.mockResolvedValue(null);

    await expect(
      assetManagementService.getById(existingAsset.asset_id, {
        userId: 'user-1',
        permissions: ['assets.read'],
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });
  });

  it('maps all response-safe asset details', async () => {
    findByIdMock.mockResolvedValue(existingAsset);

    const result = await assetManagementService.getById(existingAsset.asset_id, {
      userId: 'user-1',
      permissions: ['assets.read'],
    });

    expect(result).toEqual({
      id: existingAsset.asset_id,
      assetCode: 'AST-001',
      name: 'Database Server',
      assetType: 'server',
      criticality: 'medium',
      status: 'active',
      location: 'Server Room',
      department: null,
      owner: null,
      updatedAt: existingAsset.updated_at,
      description: null,
      hostname: 'db-01',
      ipAddress: '192.168.1.10',
      createdAt: existingAsset.created_at,
    });
  });
});

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

describe('assetManagementService.classifyCriticality', () => {
  const actor = { userId: 'user-1', permissions: ['assets.classify'] };
  const context = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
  const input = {
    confidentialityImpact: 4,
    integrityImpact: 5,
    availabilityImpact: 5,
    businessImpact: 4,
    reason: 'Production customer database',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue(existingAsset);
    classifyCriticalityMock.mockResolvedValue(undefined);
  });

  it('requires assets.classify and an existing usable asset', async () => {
    await expect(
      assetManagementService.classifyCriticality(
        existingAsset.asset_id,
        input,
        { userId: 'user-1', permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    findByIdMock.mockResolvedValueOnce(null);
    await expect(
      assetManagementService.classifyCriticality(existingAsset.asset_id, input, actor, context),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ASSET_NOT_FOUND' });

    findByIdMock.mockResolvedValueOnce({ ...existingAsset, status: 'disposed' });
    await expect(
      assetManagementService.classifyCriticality(existingAsset.asset_id, input, actor, context),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ASSET_DISPOSED' });
  });

  it('calculates the weighted score and criticality on the server', async () => {
    const result = await assetManagementService.classifyCriticality(
      existingAsset.asset_id,
      input,
      actor,
      context,
    );

    expect(result).toMatchObject({
      assetId: existingAsset.asset_id,
      previousCriticality: 'medium',
      criticality: 'critical',
      score: 4.55,
      changed: true,
    });
    const classification: unknown = classifyCriticalityMock.mock.calls[0]?.[1];
    expect(classification).toMatchObject({
      previousCriticality: 'medium',
      criticality: 'critical',
      score: 4.55,
      changed: true,
      criteria: {
        confidentialityImpact: 4,
        integrityImpact: 5,
        availabilityImpact: 5,
        businessImpact: 4,
      },
      reason: input.reason,
    });
  });

  it('still records a classification when the criticality does not change', async () => {
    findByIdMock.mockResolvedValue({ ...existingAsset, criticality: 'medium' });
    const mediumInput = {
      confidentialityImpact: 2,
      integrityImpact: 2,
      availabilityImpact: 3,
      businessImpact: 3,
      reason: 'Periodic review',
    };

    const result = await assetManagementService.classifyCriticality(
      existingAsset.asset_id,
      mediumInput,
      actor,
      context,
    );

    expect(result).toMatchObject({ criticality: 'medium', score: 2.5, changed: false });
    expect(classifyCriticalityMock).toHaveBeenCalledOnce();
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
