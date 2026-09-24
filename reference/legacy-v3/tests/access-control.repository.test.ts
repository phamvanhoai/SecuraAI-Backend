import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  roleFindMany: vi.fn(),
  roleCount: vi.fn(),
  permissionFindMany: vi.fn(),
  permissionCount: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    roles: { findMany: mocks.roleFindMany, count: mocks.roleCount },
    permissions: { findMany: mocks.permissionFindMany, count: mocks.permissionCount },
    $transaction: mocks.transaction,
  },
}));
import { accessControlRepository } from '../src/modules/access-control/access-control.repository.js';

describe('accessControlRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  });
  it('lists both system and custom roles with pagination and search', async () => {
    mocks.roleFindMany.mockResolvedValue([]);
    mocks.roleCount.mockResolvedValue(0);
    await accessControlRepository.listRoles({
      page: 2,
      limit: 10,
      search: 'risk',
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(mocks.roleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
        skip: 10,
        take: 10,
      }),
    );
    expect(mocks.roleCount).toHaveBeenCalledWith({
      where: expect.not.objectContaining({ is_system: false }),
    });
  });
  it('lists permissions with bounded pagination and filters', async () => {
    mocks.permissionFindMany.mockResolvedValue([]);
    mocks.permissionCount.mockResolvedValue(0);
    await accessControlRepository.listPermissions({
      page: 2,
      limit: 25,
      module: 'access-control',
      search: 'role',
      sortBy: 'code',
      sortOrder: 'asc',
    });
    expect(mocks.permissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ module: 'access-control', OR: expect.any(Array) }),
        skip: 25,
        take: 25,
      }),
    );
  });
});
