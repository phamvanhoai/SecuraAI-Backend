import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    login_history: { findMany: mocks.list, count: mocks.count },
    $transaction: mocks.transaction,
  },
}));
import { auditSettingsRepository } from '../src/modules/audit-settings/audit-settings.repository.js';
import { listLoginHistoryQuerySchema } from '../src/modules/audit-settings/dto/index.js';
describe('Login history repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  });
  it('uses bounded paging, stable ordering, explicit fields and shared filters in a snapshot', async () => {
    const query = listLoginHistoryQuerySchema.parse({
      page: 2,
      limit: 10,
      search: 'Admin',
      status: 'failed',
      ipAddress: '::1',
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-18T00:00:00Z',
    });
    await auditSettingsRepository.listLoginHistory(query);
    const options = mocks.list.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      skip: 10,
      take: 10,
      where: {
        success: false,
        ip_address: '::1',
        logged_in_at: { gte: new Date(query.from ?? ''), lte: new Date(query.to ?? '') },
        OR: [
          { email_attempted: { contains: 'Admin', mode: 'insensitive' } },
          { users: { is: { full_name: { contains: 'Admin', mode: 'insensitive' } } } },
        ],
      },
      orderBy: [{ logged_in_at: 'desc' }, { login_history_id: 'desc' }],
      select: { users: { select: { full_name: true } } },
    });
    expect(mocks.count).toHaveBeenCalledWith({ where: options.where });
    expect(options.select).not.toHaveProperty('password_hash');
    expect(mocks.transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: 'RepeatableRead' });
  });
});
