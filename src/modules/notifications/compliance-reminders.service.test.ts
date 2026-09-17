import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), mark: vi.fn() }));
vi.mock('./notifications.repository.js', () => ({
  notificationsRepository: {
    listComplianceReminders: mocks.list,
    markComplianceReminderRead: mocks.mark,
  },
}));
import { notificationsService } from './notifications.service.js';
describe('compliance reminder access', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows an employee with policy acknowledgement permission to read own inbox', async () => {
    mocks.list.mockResolvedValue([[], 0]);
    const result = await notificationsService.listComplianceReminders(
      { userId: 'employee-1', permissions: ['policies.acknowledge'] },
      { page: 1, limit: 10, status: 'all' },
    );
    expect(result.pagination.total).toBe(0);
    expect(mocks.list).toHaveBeenCalledWith('employee-1', expect.any(Object));
  });
  it('rejects accounts without a compliance responsibility', async () => {
    await expect(
      notificationsService.listComplianceReminders(
        { userId: 'user-1', permissions: [] },
        { page: 1, limit: 10, status: 'all' },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
