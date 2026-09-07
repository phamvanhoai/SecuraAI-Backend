import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assetCreateMock,
  auditCreateMock,
  countMock,
  findManyMock,
  historyCreateMock,
  transactionMock,
} = vi.hoisted(() => ({
  assetCreateMock: vi.fn(),
  auditCreateMock: vi.fn(),
  countMock: vi.fn(),
  findManyMock: vi.fn(),
  historyCreateMock: vi.fn(),
  transactionMock: vi.fn(),
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
