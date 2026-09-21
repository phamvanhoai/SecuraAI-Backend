import { beforeEach, describe, expect, it, vi } from 'vitest';
import { duplicateCourseBodySchema } from './dto/duplicate-course.dto.js';
import { courseDuplicateService } from './course-duplicate.service.js';

const mocks = vi.hoisted(() => ({ duplicate: vi.fn() }));
vi.mock('./course-duplicate.repository.js', () => ({ courseDuplicateRepository: mocks }));

const context = { ipAddress: null, userAgent: null };
const actor = { userId: 'actor', permissions: ['training-courses.duplicate'] };

describe('course duplication', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates a bounded replacement title', () => {
    expect(duplicateCourseBodySchema.parse({ title: 'Phishing awareness (Copy)' })).toEqual({
      title: 'Phishing awareness (Copy)',
    });
    expect(duplicateCourseBodySchema.safeParse({ title: 'x' }).success).toBe(false);
  });

  it('requires the dedicated permission', async () => {
    await expect(
      courseDuplicateService.duplicate(
        'course',
        { title: 'Copy' },
        { userId: 'actor', permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.duplicate).not.toHaveBeenCalled();
  });

  it('returns an independent draft', async () => {
    mocks.duplicate.mockResolvedValue({
      training_course_id: 'copy',
      title: 'Copy',
      description: null,
      content: 'Content',
      status: 'draft',
      created_by_user_id: 'actor',
      created_at: new Date('2026-09-21T00:00:00Z'),
      updated_at: new Date('2026-09-21T00:00:00Z'),
    });
    await expect(
      courseDuplicateService.duplicate('source', { title: 'Copy' }, actor, context),
    ).resolves.toMatchObject({ id: 'copy', status: 'draft' });
    expect(mocks.duplicate).toHaveBeenCalledWith(
      'source',
      'Copy',
      expect.objectContaining({ actorUserId: 'actor' }),
    );
  });
});
