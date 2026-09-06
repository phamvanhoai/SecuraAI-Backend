import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listAssetsMock } = vi.hoisted(() => ({ listAssetsMock: vi.fn() }));

vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: { list: listAssetsMock },
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
