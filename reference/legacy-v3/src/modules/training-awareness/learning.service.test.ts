import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), find: vi.fn(), completeLesson: vi.fn() }));
vi.mock('./learning.repository.js', () => ({ learningRepository: mocks }));
import { learningService } from './learning.service.js';
const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['training-assessments.take'],
};
describe('learning service', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires the learner permission', async () => {
    await expect(
      learningService.list({ page: 1, limit: 10 }, { ...actor, permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('does not expose another user enrollment', async () => {
    mocks.find.mockResolvedValue(null);
    await expect(
      learningService.get('00000000-0000-4000-8000-000000000002', actor),
    ).rejects.toMatchObject({ statusCode: 404, code: 'TRAINING_ENROLLMENT_NOT_FOUND' });
  });
  it('requires a configured lesson assessment before manual completion', async () => {
    mocks.completeLesson.mockResolvedValue({ kind: 'assessment_required' });
    await expect(
      learningService.completeLesson(
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'LESSON_ASSESSMENT_REQUIRED' });
  });
});
