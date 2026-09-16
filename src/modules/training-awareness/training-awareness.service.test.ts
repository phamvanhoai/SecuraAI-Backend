import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trainingAwarenessService } from './training-awareness.service.js';

const repositoryMocks = vi.hoisted(() => ({
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
