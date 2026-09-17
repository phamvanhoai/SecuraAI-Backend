import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { trainingRemindersService } from './training-reminders.service.js';
import { reminderId } from './training-reminder-policy.js';

const mocks = vi.hoisted(() => ({ find: vi.fn(), process: vi.fn(), create: vi.fn() }));
vi.mock('./training-reminders.repository.js', () => ({
  trainingRemindersRepository: { findCandidates: mocks.find, processCandidate: mocks.process },
}));
vi.mock('../notifications/index.js', () => ({
  notificationsService: { createTrainingReminder: mocks.create },
}));
const enrollment = {
  training_enrollment_id: '00000000-0000-4000-8000-000000000001',
  user_id: 'employee',
  training_campaigns: {
    due_date: new Date('2026-09-19T00:00:00Z'),
    title: 'September campaign',
    training_courses: { title: 'Phishing awareness' },
  },
};
const tx = {} as Prisma.TransactionClient;
describe('automatic training reminder dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue([{ training_enrollment_id: enrollment.training_enrollment_id }]);
    mocks.process.mockImplementation(
      (
        _id: string,
        _now: Date,
        callback: (
          item: typeof enrollment,
          transaction: Prisma.TransactionClient,
        ) => Promise<boolean>,
      ) => callback(enrollment, tx),
    );
    mocks.create.mockResolvedValue(true);
  });
  it('sends an in-app snapshot with the current enrollment/deadline/milestone key', async () => {
    const now = new Date('2026-09-16T12:00:00Z');
    expect(await trainingRemindersService.dispatch(now)).toEqual({
      delivered: 1,
      processed: 1,
      hasMore: false,
    });
    const data = mocks.create.mock.calls[0]?.[1] as {
      notificationId: string;
      enrollmentId: string;
      milestone: number;
      message: string;
    };
    expect(data.notificationId).toBe(
      reminderId(enrollment.training_enrollment_id, enrollment.training_campaigns.due_date, 3),
    );
    expect(data.milestone).toBe(3);
    expect(data.enrollmentId).toBe(enrollment.training_enrollment_id);
    expect(data.message).toContain('2026-09-19');
    expect(data.message).toContain('Phishing awareness');
  });
  it('does not count a concurrent duplicate as delivered', async () => {
    mocks.create.mockResolvedValue(false);
    expect(
      (await trainingRemindersService.dispatch(new Date('2026-09-16T12:00:00Z'))).delivered,
    ).toBe(0);
  });
  it('does not send if the deadline is outside the eligible windows', async () => {
    await trainingRemindersService.dispatch(new Date('2026-09-20T12:00:00Z'));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('creates only the current milestone when catching up near the deadline', async () => {
    await trainingRemindersService.dispatch(new Date('2026-09-19T12:00:00Z'));
    const data = mocks.create.mock.calls[0]?.[1] as { milestone: number };
    expect(data.milestone).toBe(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('fails without reporting a delivery when the transaction fails', async () => {
    mocks.process.mockRejectedValue(new Error('database failed'));
    await expect(
      trainingRemindersService.dispatch(new Date('2026-09-16T12:00:00Z')),
    ).rejects.toThrow('database failed');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
