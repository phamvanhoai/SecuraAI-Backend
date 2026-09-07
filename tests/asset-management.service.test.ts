import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAssetMock,
  findByCodeMock,
  findDepartmentByIdMock,
  findOwnerByIdMock,
  listAssetsMock,
} = vi.hoisted(() => ({
  createAssetMock: vi.fn(),
  findByCodeMock: vi.fn(),
  findDepartmentByIdMock: vi.fn(),
  findOwnerByIdMock: vi.fn(),
  listAssetsMock: vi.fn(),
}));

vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: {
    create: createAssetMock,
    findByCode: findByCodeMock,
    findDepartmentById: findDepartmentByIdMock,
    findOwnerById: findOwnerByIdMock,
    list: listAssetsMock,
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
