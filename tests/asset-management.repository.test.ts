import { beforeEach, describe, expect, it, vi } from 'vitest';

const { countMock, findManyMock, transactionMock } = vi.hoisted(() => ({
  countMock: vi.fn(),
  findManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    assets: { count: countMock, findMany: findManyMock },
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
});
