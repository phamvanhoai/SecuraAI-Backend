import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    audit_logs: { findMany: mocks.findMany, count: mocks.count },
  },
}));
import { userActivityAuditRepository } from '../src/modules/audit-security-reporting/user-activity-audit.repository.js';

describe('user activity audit repository search', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findMany.mockReturnValue('items-query');
    mocks.count.mockReturnValue('count-query');
    mocks.transaction.mockResolvedValue([[], 0]);
  });

  it('matches each human-readable search term across actor, action, and resource fields', async () => {
    await userActivityAuditRepository.list({
      page: 1,
      limit: 20,
      q: 'Notification preferences · Security Officer',
    });

    const call = mocks.findMany.mock.calls[0]?.[0];
    expect(call?.where.AND).toHaveLength(4);
    expect(call?.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { resource_type: { contains: 'Notification', mode: 'insensitive' } },
          ]),
        }),
        expect.objectContaining({
          OR: expect.arrayContaining([
            { users: { full_name: { contains: 'Officer', mode: 'insensitive' } } },
          ]),
        }),
      ]),
    );
  });
});
