import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ count: vi.fn(), find: vi.fn(), group: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    training_campaigns: { count: mocks.count, findMany: mocks.find },
    training_enrollments: { groupBy: mocks.group },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));
import { completionCampaignsQuerySchema } from '../src/modules/training-awareness/dto/completion.dto.js';
import { trainingAwarenessRepository } from '../src/modules/training-awareness/training-awareness.repository.js';
describe('training progress course scope', () => {
  const courseId = '00000000-0000-4000-8000-000000000001';
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.find.mockResolvedValue([]);
  });
  it('rejects invalid course identifiers and retains bounded pagination', () => {
    expect(completionCampaignsQuerySchema.safeParse({ courseId: 'bad' }).success).toBe(false);
    expect(completionCampaignsQuerySchema.safeParse({ courseId, limit: 51 }).success).toBe(false);
  });
  it('filters count and rows by exact course UUID, not title text', async () => {
    await trainingAwarenessRepository.listCompletionCampaigns(
      completionCampaignsQuerySchema.parse({ courseId, q: 'Phishing' }),
    );
    expect(mocks.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ training_course_id: courseId, OR: expect.any(Array) }),
    });
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ training_course_id: courseId }),
        take: 10,
        skip: 0,
      }),
    );
  });
});
