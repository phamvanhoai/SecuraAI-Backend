import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), transaction: vi.fn() }));
vi.mock('../../database/prisma.js', () => ({
  prisma: {
    training_certificates: { count: mocks.count, findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));
import { issuedCertificatesRepository } from './issued-certificates.repository.js';

describe('issued certificate repository', () => {
  it('searches server-side and applies bounded pagination', async () => {
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
    await issuedCertificatesRepository.list({ page: 2, limit: 10, q: 'employee' });
    const countQuery: unknown = mocks.count.mock.calls[0]?.[0];
    const pageQuery: unknown = mocks.findMany.mock.calls[0]?.[0];
    expect(countQuery).toHaveProperty('where.OR');
    expect(pageQuery).toMatchObject({ skip: 10, take: 10 });
  });
});
