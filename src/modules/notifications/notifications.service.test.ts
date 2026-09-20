import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsService } from './notifications.service.js';

const mocks = vi.hoisted(() => ({
  listTrainingReminders: vi.fn(),
  markTrainingReminderRead: vi.fn(),
  createTrainingReminder: vi.fn(),
}));
vi.mock('./notifications.repository.js', () => ({ notificationsRepository: mocks }));
const actor = { userId: 'employee-1', permissions: ['training-assessments.take'] };
describe('own training reminders', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects missing permissions before database access', async () => {
    await expect(
      notificationsService.listTrainingReminders(
        { ...actor, permissions: [] },
        { page: 1, limit: 10, status: 'all' },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.listTrainingReminders).not.toHaveBeenCalled();
  });
  it('scopes the inbox to the actor and produces bounded pagination', async () => {
    mocks.listTrainingReminders.mockResolvedValue([[], 0, 4, 2]);
    expect(
      await notificationsService.listTrainingReminders(actor, {
        page: 1,
        limit: 10,
        status: 'unread',
      }),
    ).toEqual({
      items: [],
      summary: { total: 4, unread: 2 },
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    expect(mocks.listTrainingReminders).toHaveBeenCalledWith(actor.userId, {
      page: 1,
      limit: 10,
      status: 'unread',
    });
  });
  it('returns generic 404 for a missing or other-user reminder', async () => {
    mocks.markTrainingReminderRead.mockResolvedValue(null);
    await expect(
      notificationsService.markTrainingReminderRead(actor, 'other-user-id'),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.markTrainingReminderRead).toHaveBeenCalledWith(
      'employee-1',
      'other-user-id',
      expect.any(Date),
    );
  });
});
