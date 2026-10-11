import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  services: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  assets: { count: vi.fn(), findMany: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    business_services: mocks.services,
    assets: mocks.assets,
    $transaction: mocks.transaction,
  },
}));
import { businessServicesRepository as repository } from '../src/modules/it-asset-management/business-services.repository.js';
describe('bounded service queries', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses identical search/status filters for count and data, with stable pagination', async () => {
    await repository.list({ page: 3, limit: 10, q: 'Support', status: 'inactive' });
    const filter = mocks.services.count.mock.calls[0]?.[0];
    expect(filter).toMatchObject({
      where: {
        status: 'INACTIVE',
        OR: expect.arrayContaining([
          { name: { contains: 'Support', mode: 'insensitive' } },
          { description: { contains: 'Support', mode: 'insensitive' } },
          { users: { full_name: { contains: 'Support', mode: 'insensitive' } } },
        ]),
      },
    });
    expect(mocks.services.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: filter?.where,
        skip: 20,
        take: 10,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: expect.objectContaining({ _count: { select: { assets: true } } }),
      }),
    );
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: 'RepeatableRead',
    });
  });
  it('does not drop inactive services or archived linked assets', async () => {
    await repository.list({ page: 1, limit: 10 });
    expect(mocks.services.count).toHaveBeenCalledWith({ where: {} });
    await repository.listAssets('service', { page: 2, limit: 10 });
    expect(mocks.assets.count).toHaveBeenCalledWith({ where: { business_service_id: 'service' } });
    expect(mocks.assets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { business_service_id: 'service' }, skip: 10, take: 10 }),
    );
  });
  it('selects only safe owner identity fields', async () => {
    await repository.findById('service');
    expect(mocks.services.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          users: { select: { id: true, full_name: true, status: true } },
        }),
      }),
    );
  });
});
