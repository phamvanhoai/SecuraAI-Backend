import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), transaction: vi.fn() }));
vi.mock('../../database/prisma.js', () => ({
  prisma: {
    training_certificates: { count: mocks.count, findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));
import { myCertificatesRepository } from './my-certificates.repository.js';

describe('my certificate repository ownership', () => {
  it('retains the authenticated user filter while searching', async () => {
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
    await myCertificatesRepository.list('signed-in-user', { page: 2, limit: 10, q: 'phishing' });
    const countQuery: unknown = mocks.count.mock.calls[0]?.[0];
    const pageQuery: unknown = mocks.findMany.mock.calls[0]?.[0];
    expect(countQuery).toMatchObject({
      where: { training_enrollments: { user_id: 'signed-in-user' } },
    });
    expect(pageQuery).toMatchObject({
      where: { training_enrollments: { user_id: 'signed-in-user' } },
      skip: 10,
      take: 10,
    });
  });
});
