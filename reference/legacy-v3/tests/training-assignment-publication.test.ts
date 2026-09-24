import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findCourse: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (callback: (transaction: unknown) => unknown) =>
      callback({
        training_courses: { findUnique: mocks.findCourse },
      }),
  },
}));
import { trainingAwarenessRepository } from '../src/modules/training-awareness/training-awareness.repository.js';
import { trainingAwarenessService } from '../src/modules/training-awareness/training-awareness.service.js';
import { assignCourseBodySchema } from '../src/modules/training-awareness/dto/course.dto.js';
const id = '00000000-0000-4000-8000-000000000001';
const input = assignCourseBodySchema.parse({
  title: 'Awareness campaign',
  startDate: '2026-09-20',
  dueDate: '2026-10-20',
  userIds: [id],
  departmentIds: [],
  createNewCampaign: true,
});
const context = { actorUserId: id, ipAddress: null, userAgent: null };
describe('training assignment publication gate', () => {
  it('rejects draft before resolving targets or writing campaigns', async () => {
    mocks.findCourse.mockResolvedValue({ training_course_id: id, status: 'draft' });
    expect(await trainingAwarenessRepository.assignCourse(id, input, context)).toEqual({
      kind: 'course_not_published',
    });
  });
  it('does not assign archived courses', async () => {
    mocks.findCourse.mockResolvedValue({ training_course_id: id, status: 'archived' });
    expect(await trainingAwarenessRepository.assignCourse(id, input, context)).toEqual({
      kind: 'course_not_found',
    });
  });
  it('returns a recoverable 409 for a draft', async () => {
    mocks.findCourse.mockResolvedValue({ training_course_id: id, status: 'draft' });
    await expect(
      trainingAwarenessService.assignCourse(
        id,
        input,
        { userId: id, permissions: ['training-courses.assign'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'COURSE_NOT_PUBLISHED' });
  });
});
