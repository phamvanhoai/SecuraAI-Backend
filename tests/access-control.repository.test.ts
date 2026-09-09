import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    roles: { findMany: mocks.findMany, count: mocks.count },
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
  it('always limits role listings to custom roles', async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    await accessControlRepository.listCustomRoles({
      page: 2,
      limit: 10,
      search: 'risk',
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ is_system: false }),
        skip: 10,
        take: 10,
      }),
    );
    expect(mocks.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ is_system: false }),
    });
  });
});
