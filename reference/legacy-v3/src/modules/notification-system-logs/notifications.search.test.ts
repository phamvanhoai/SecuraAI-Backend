import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsRepository } from './notifications.repository.js';

const mocks = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock('../../database/prisma.js', () => ({
  prisma: {
    notifications: { findMany: mocks.find, count: mocks.count },
    $transaction: mocks.transaction,
  },
}));
describe('training reminder search before pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockResolvedValue([[], 0, 0, 0]);
  });
  it('keeps actor ownership, unread filter and the same search in list and count', async () => {
    await notificationsRepository.listTrainingReminders('employee-1', {
      page: 3,
      limit: 10,
      status: 'unread',
      search: 'Phishing',
    });
    const filter = {
      user_id: 'employee-1',
      type: { in: ['training_deadline_3d', 'training_deadline_1d'] },
      is_read: false,
      OR: [
        { title: { contains: 'Phishing', mode: 'insensitive' } },
        { message: { contains: 'Phishing', mode: 'insensitive' } },
      ],
    };
    expect(mocks.find.mock.calls[0]?.[0] as unknown).toMatchObject({
      where: filter,
      skip: 20,
      take: 10,
    });
    expect(mocks.count).toHaveBeenCalledWith({ where: filter });
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        user_id: 'employee-1',
        type: { in: ['training_deadline_3d', 'training_deadline_1d'] },
      },
    });
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        user_id: 'employee-1',
        type: { in: ['training_deadline_3d', 'training_deadline_1d'] },
        is_read: false,
      },
    });
  });
  it('treats wildcard characters as literal user text', async () => {
    await notificationsRepository.listTrainingReminders('employee-1', {
      page: 1,
      limit: 10,
      status: 'all',
      search: '100%_\\',
    });
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        user_id: 'employee-1',
        type: { in: ['training_deadline_3d', 'training_deadline_1d'] },
        OR: [
          { title: { contains: '100\\%\\_\\\\', mode: 'insensitive' } },
          { message: { contains: '100\\%\\_\\\\', mode: 'insensitive' } },
        ],
      },
    });
  });
});
