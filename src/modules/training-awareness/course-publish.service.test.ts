import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coursePublishService } from './course-publish.service.js';

const mocks = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock('./course-publish.repository.js', () => ({ coursePublishRepository: mocks }));

const actor = { userId: 'actor', permissions: ['training-courses.publish'] };
const context = { ipAddress: null, userAgent: null };

describe('course publishing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the dedicated permission', async () => {
    await expect(
      coursePublishService.publish('course', { userId: 'actor', permissions: [] }, context),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each([
    ['no_lessons', 422, 'TRAINING_COURSE_HAS_NO_LESSONS'],
    ['lesson_without_material', 422, 'TRAINING_LESSON_HAS_NO_MATERIAL'],
    ['not_draft', 409, 'TRAINING_COURSE_NOT_DRAFT'],
  ] as const)('maps %s to a business error', async (kind, statusCode, code) => {
    mocks.publish.mockResolvedValue({ kind });
    await expect(coursePublishService.publish('course', actor, context)).rejects.toMatchObject({
      statusCode,
      code,
    });
  });

  it('returns the published course', async () => {
    mocks.publish.mockResolvedValue({
      kind: 'published',
      course: {
        training_course_id: 'course',
        title: 'Phishing',
        description: null,
        content: 'Course content',
        status: 'published',
        created_by_user_id: null,
        created_at: new Date('2026-09-20T00:00:00Z'),
        updated_at: new Date('2026-09-21T00:00:00Z'),
      },
    });
    await expect(coursePublishService.publish('course', actor, context)).resolves.toMatchObject({
      id: 'course',
      status: 'published',
    });
  });
});
