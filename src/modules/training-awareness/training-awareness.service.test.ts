import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trainingAwarenessService } from './training-awareness.service.js';

const repositoryMocks = vi.hoisted(() => ({
  getCompletionCampaign: vi.fn(),
  listMyAssessments: vi.fn(),
  getMyAssessment: vi.fn(),
  submitAssessment: vi.fn(),
  withdrawEnrollment: vi.fn(),
}));

vi.mock('./training-awareness.repository.js', () => ({
  trainingAwarenessRepository: repositoryMocks,
}));

describe('trainingAwarenessService assessments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires assignment permission before withdrawing', async () => {
    await expect(
      trainingAwarenessService.withdrawEnrollment(
        'id',
        'Requested by manager',
        { userId: 'user-1', permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repositoryMocks.withdrawEnrollment).not.toHaveBeenCalled();
  });

  it('does not withdraw completed or already withdrawn enrollments', async () => {
    repositoryMocks.withdrawEnrollment.mockResolvedValue(false);
    await expect(
      trainingAwarenessService.withdrawEnrollment(
        'id',
        'Requested by manager',
        { userId: 'user-1', permissions: ['training-courses.assign'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('passes withdrawal reason and actor to the repository', async () => {
    repositoryMocks.withdrawEnrollment.mockResolvedValue(true);
    await expect(
      trainingAwarenessService.withdrawEnrollment(
        'id',
        'Requested by manager',
        { userId: 'user-1', permissions: ['training-courses.assign'] },
        { ipAddress: null, userAgent: null },
      ),
    ).resolves.toEqual({ withdrawn: true });
    expect(repositoryMocks.withdrawEnrollment).toHaveBeenCalledWith('id', 'Requested by manager', {
      actorUserId: 'user-1',
      ipAddress: null,
      userAgent: null,
    });
  });

  it('rejects users without the assessment permission', async () => {
    await expect(
      trainingAwarenessService.listMyAssessments(
        { page: 1, limit: 10 },
        { userId: 'user-1', permissions: [] },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repositoryMocks.listMyAssessments).not.toHaveBeenCalled();
  });

  it('maps an exhausted attempt limit to a conflict', async () => {
    repositoryMocks.submitAssessment.mockResolvedValue({
      kind: 'attempt_limit',
    });
    await expect(
      trainingAwarenessService.submitMyAssessment(
        '25f1b839-abd4-4c68-8ca4-7ae422457729',
        {
          answers: [
            {
              questionId: '5ba7b932-11ed-4bb4-a813-1ba9e34a2f95',
              optionIds: ['e52400f2-87d5-456e-8efd-6e4d833068be'],
            },
          ],
        },
        { userId: 'user-1', permissions: ['training-assessments.take'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'ASSESSMENT_ATTEMPT_LIMIT_REACHED',
    });
  });
});

describe('trainingAwarenessService completion tracking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns campaign-wide metrics and learner lesson and assessment progress', async () => {
    repositoryMocks.getCompletionCampaign.mockResolvedValue({
      campaign: {
        training_campaign_id: 'campaign-1',
        title: 'September awareness',
        start_date: new Date('2026-09-01T00:00:00.000Z'),
        due_date: new Date('2099-09-30T00:00:00.000Z'),
        training_courses: {
          title: 'Phishing awareness',
          training_lessons: [
            { training_lesson_id: 'lesson-1' },
            { training_lesson_id: 'lesson-2' },
          ],
          quizzes: [{ quiz_id: 'quiz-1' }],
        },
      },
      statusGroups: [
        { status: 'assigned', _count: { _all: 1 }, _avg: { progress_percent: 0 } },
        { status: 'in_progress', _count: { _all: 1 }, _avg: { progress_percent: 50 } },
        { status: 'completed', _count: { _all: 1 }, _avg: { progress_percent: 100 } },
        { status: 'withdrawn', _count: { _all: 1 }, _avg: { progress_percent: 0 } },
      ],
      items: [
        {
          training_enrollment_id: 'enrollment-1',
          status: 'in_progress',
          progress_percent: 50,
          started_at: new Date('2026-09-10T00:00:00.000Z'),
          completed_at: null,
          last_accessed_at: new Date('2026-09-11T00:00:00.000Z'),
          training_lesson_progress: [{ training_lesson_id: 'lesson-1', status: 'completed' }],
          quiz_attempts: [
            { score: 75, passed: true, submitted_at: new Date('2026-09-11T00:00:00.000Z') },
          ],
          training_certificates: null,
          users: {
            user_id: 'user-1',
            full_name: 'Alex Morgan',
            email: 'alex@example.com',
            employee_code: 'EMP-001',
          },
        },
      ],
      total: 1,
    });

    const result = await trainingAwarenessService.getCompletionCampaign(
      'campaign-1',
      { page: 1, limit: 20, q: '', status: 'all' },
      { userId: 'officer-1', permissions: ['training-completion.read'] },
    );

    expect(result.summary).toEqual({
      assigned: 3,
      completed: 1,
      inProgress: 1,
      notStarted: 1,
      overdue: 0,
      withdrawn: 1,
      completionRate: 33,
      averageProgress: 50,
    });
    expect(result.items[0]).toMatchObject({
      requiredLessons: { completed: 1, total: 2 },
      finalAssessment: { required: true, passed: true, latestScore: 75 },
    });
  });
});
