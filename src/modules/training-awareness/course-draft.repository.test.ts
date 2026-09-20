import { beforeEach, describe, expect, it, vi } from 'vitest';
import { courseDraftRepository } from './course-draft.repository.js';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock('../../database/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    training_courses: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
  },
}));

const tx = {
  training_courses: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
  quizzes: { findMany: vi.fn(), deleteMany: mocks.deleteMany },
  quiz_options: { deleteMany: mocks.deleteMany },
  quiz_questions: { deleteMany: mocks.deleteMany },
  training_materials: { deleteMany: mocks.deleteMany },
  training_lessons: { deleteMany: mocks.deleteMany },
};
const before = {
  training_course_id: 'course',
  title: 'Course',
  description: null,
  content: 'Course learning objectives',
  status: 'draft',
  updated_at: new Date('2026-09-19T08:00:00.000Z'),
  training_campaigns: [],
  training_lessons: [],
  quizzes: [],
};
const input = {
  title: 'Course',
  description: null,
  content: 'Course learning objectives',
  lessons: [
    {
      title: 'Lesson',
      isRequired: true,
      materials: [{ title: 'Text', type: 'text' as const, content: 'Lesson content' }],
    },
  ],
  expectedUpdatedAt: '2026-09-19T09:00:00.000Z',
};

describe('course draft repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
  });

  it('checks optimistic concurrency before deleting draft content', async () => {
    mocks.findUnique.mockResolvedValue(before);
    await expect(
      courseDraftRepository.update(
        'course',
        input,
        { actorUserId: 'actor', ipAddress: null, userAgent: null },
        [],
      ),
    ).resolves.toEqual({ kind: 'stale' });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('does not edit a draft after an assignment campaign exists', async () => {
    mocks.findUnique.mockResolvedValue({
      ...before,
      training_campaigns: [{ training_campaign_id: 'campaign' }],
    });
    await expect(
      courseDraftRepository.update(
        'course',
        { ...input, expectedUpdatedAt: before.updated_at.toISOString() },
        { actorUserId: 'actor', ipAddress: null, userAgent: null },
        [],
      ),
    ).resolves.toEqual({ kind: 'in_use' });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('stops before destructive writes when the atomic version check loses a race', async () => {
    mocks.findUnique.mockResolvedValue(before);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      courseDraftRepository.update(
        'course',
        { ...input, expectedUpdatedAt: before.updated_at.toISOString() },
        { actorUserId: 'actor', ipAddress: null, userAgent: null },
        [],
      ),
    ).resolves.toEqual({ kind: 'stale' });
    const compareAndSwap: unknown = mocks.updateMany.mock.calls[0]?.[0];
    expect(compareAndSwap).toMatchObject({ where: { updated_at: before.updated_at } });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
