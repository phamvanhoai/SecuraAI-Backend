import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trainingRemindersRepository } from './training-reminders.repository.js';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  find: vi.fn(),
  preference: vi.fn(),
  transaction: vi.fn(),
  quiz: vi.fn(),
}));
vi.mock('../../database/prisma.js', () => ({
  prisma: {
    $queryRaw: mocks.query,
    $transaction: mocks.transaction,
  },
}));
const tx = {
  $queryRaw: mocks.query,
  training_enrollments: { findFirst: mocks.find },
  notification_preferences: { findUnique: mocks.preference },
  quizzes: { findFirst: mocks.quiz },
};

describe('training reminder repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  });
  it('excludes completed, withdrawn, cancelled, future/draft courses and invalid recipients before batching', async () => {
    mocks.query.mockResolvedValue([]);
    await trainingRemindersRepository.findCandidates(new Date('2026-09-16T12:00:00Z'));
    const query = mocks.query.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain("e.status IN ('assigned', 'in_progress', 'overdue')");
    expect(query.sql).toContain('e.completed_at IS NULL');
    expect(query.sql).toContain('e.progress_percent < 100');
    expect(query.sql).toContain("course.status = 'published'");
    expect(query.sql).toContain('c.start_date <=');
    expect(query.sql).toContain('training_certificates');
    expect(query.sql).toContain("p.code = 'training-assessments.take'");
    expect(query.sql).toContain('pref.in_app_enabled = false');
    expect(query.sql).toContain('n.notification_id');
    expect(query.sql).toContain('LIMIT 100');
  });
  it('rechecks under row locks and does not send after eligibility changes', async () => {
    mocks.find.mockResolvedValue(null);
    const deliver = vi.fn();
    expect(
      await trainingRemindersRepository.processCandidate(
        '00000000-0000-4000-8000-000000000001',
        new Date(),
        deliver,
      ),
    ).toBe(false);
    const lockQuery = mocks.query.mock.calls[0]?.[0] as { sql: string };
    expect(lockQuery.sql).toContain('FOR UPDATE OF c');
    expect(mocks.find.mock.calls[0]?.[0] as unknown).toMatchObject({
      where: {
        status: { in: ['assigned', 'in_progress', 'overdue'] },
        completed_at: null,
        training_certificates: { is: null },
        users: { status: 'active', deleted_at: null },
      },
    });
    expect(deliver).not.toHaveBeenCalled();
  });
  it('honors opt-out at delivery time', async () => {
    mocks.find.mockResolvedValue({
      user_id: 'employee',
      training_campaigns: { training_courses: { training_course_id: 'course' } },
    });
    mocks.quiz.mockResolvedValue(null);
    mocks.preference.mockResolvedValue({ in_app_enabled: false });
    const deliver = vi.fn();
    expect(
      await trainingRemindersRepository.processCandidate(
        '00000000-0000-4000-8000-000000000001',
        new Date(),
        deliver,
      ),
    ).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });
  it('does not remind an already passed assessment with stale enrollment progress', async () => {
    mocks.find.mockResolvedValue({
      user_id: 'employee',
      training_campaigns: { training_courses: { training_course_id: 'course' } },
    });
    mocks.quiz.mockResolvedValue({ quiz_attempts: [{ quiz_attempt_id: 'passed-attempt' }] });
    const deliver = vi.fn();
    expect(
      await trainingRemindersRepository.processCandidate(
        '00000000-0000-4000-8000-000000000001',
        new Date(),
        deliver,
      ),
    ).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });
  it('sends inside the transaction when eligible with default preferences', async () => {
    const enrollment = {
      user_id: 'employee',
      training_campaigns: { training_courses: { training_course_id: 'course' } },
    };
    mocks.quiz.mockResolvedValue(null);
    mocks.find.mockResolvedValue(enrollment);
    mocks.preference.mockResolvedValue(null);
    const deliver = vi.fn().mockResolvedValue(true);
    expect(
      await trainingRemindersRepository.processCandidate(
        '00000000-0000-4000-8000-000000000001',
        new Date(),
        deliver,
      ),
    ).toBe(true);
    expect(deliver).toHaveBeenCalledWith(enrollment, tx);
  });
});
