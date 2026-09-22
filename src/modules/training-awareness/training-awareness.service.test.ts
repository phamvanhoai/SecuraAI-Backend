import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trainingAwarenessService } from './training-awareness.service.js';

const repositoryMocks = vi.hoisted(() => ({
  listMyAssessments: vi.fn(),
  getMyAssessment: vi.fn(),
  submitAssessment: vi.fn(),
  withdrawEnrollment: vi.fn(),
  getCourseDraft: vi.fn(),
  updateCourseDraft: vi.fn(),
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

describe('trainingAwarenessService draft course editing', () => {
  const actor = { userId: 'user-1', permissions: ['training-courses.update'] };
  const context = { ipAddress: null, userAgent: null };

  beforeEach(() => vi.clearAllMocks());

  it('requires update or create permission', async () => {
    await expect(
      trainingAwarenessService.getCourseDraft('course-1', { userId: 'user-1', permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repositoryMocks.getCourseDraft).not.toHaveBeenCalled();
  });

  it('accepts the existing create permission for backward compatibility', async () => {
    repositoryMocks.getCourseDraft.mockResolvedValue({
      training_course_id: 'course-1',
      title: 'Draft course',
      description: null,
      content: 'Draft training material.',
      status: 'draft',
      created_by_user_id: 'user-1',
      created_at: new Date('2026-09-18T00:00:00.000Z'),
      updated_at: new Date('2026-09-18T00:00:00.000Z'),
      quizzes: [],
    });
    await expect(
      trainingAwarenessService.getCourseDraft('course-1', {
        userId: 'user-1',
        permissions: ['training-courses.create'],
      }),
    ).resolves.toMatchObject({ id: 'course-1', status: 'draft' });
  });

  it('rejects edits when the repository observes a non-draft course', async () => {
    repositoryMocks.updateCourseDraft.mockResolvedValue({ kind: 'not_draft' });
    await expect(
      trainingAwarenessService.updateCourseDraft(
        'course-1',
        {
          title: 'Updated awareness course',
          description: null,
          content: 'Updated training material for employees.',
          lessons: [
            {
              title: 'Updated lesson',
              description: 'Updated lesson description',
              isRequired: true,
              materials: [
                { title: 'Updated reading', type: 'text', content: 'Updated content' },
              ],
            },
          ],
          expectedUpdatedAt: '2026-09-18T00:00:00.000Z',
        },
        actor,
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'TRAINING_COURSE_NOT_DRAFT' });
  });
});
