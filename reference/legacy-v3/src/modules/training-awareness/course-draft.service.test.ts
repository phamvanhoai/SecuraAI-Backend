import { beforeEach, describe, expect, it, vi } from 'vitest';
import { courseDraftService } from './course-draft.service.js';

const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), cleanup: vi.fn() }));
vi.mock('./course-draft.repository.js', () => ({
  courseDraftRepository: { find: mocks.find, update: mocks.update },
}));
vi.mock('./course-material.upload.js', () => ({ cleanupStoredCourseMaterials: mocks.cleanup }));

const actor = { userId: 'actor', permissions: ['training-courses.update'] };
const input = {
  title: 'Security basics',
  description: null,
  content: 'Learn core security practices.',
  lessons: [
    {
      title: 'Passwords',
      isRequired: true,
      materials: [{ title: 'Guide', type: 'text' as const, content: 'Use unique passwords.' }],
    },
  ],
  expectedUpdatedAt: '2026-09-19T08:00:00.000Z',
};

describe('course draft service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the dedicated update permission', async () => {
    await expect(
      courseDraftService.get('course', { userId: 'actor', permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('returns editable existing files without nullable form fields or storage keys', async () => {
    mocks.find.mockResolvedValue({
      training_course_id: 'course',
      title: 'Security basics',
      description: null,
      content: 'Learn core security practices.',
      status: 'draft',
      updated_at: new Date('2026-09-19T08:00:00.000Z'),
      training_campaigns: [],
      training_lessons: [
        {
          title: 'Passwords',
          description: null,
          is_required: true,
          quizzes: [],
          training_materials: [
            {
              title: 'Video',
              material_type: 'video',
              content: null,
              external_url: null,
              file_id: 'file-1',
              files: {
                file_id: 'file-1',
                original_name: 'lesson.mp4',
                mime_type: 'video/mp4',
                size_bytes: BigInt(100),
                storage_key: 'training-materials/private',
              },
            },
          ],
        },
      ],
      quizzes: [],
    });
    const result = await courseDraftService.get('course', actor);
    expect(result.lessons[0]?.materials[0]).toEqual({
      title: 'Video',
      type: 'video',
      existingFileId: 'file-1',
      existingFile: { name: 'lesson.mp4', mimeType: 'video/mp4', sizeBytes: 100 },
    });
    expect(JSON.stringify(result)).not.toContain('storage_key');
    expect(result.lessons[0]).not.toHaveProperty('assessment');
  });

  it('rejects a stale save without cleaning stored files', async () => {
    mocks.update.mockResolvedValue({ kind: 'stale' });
    await expect(
      courseDraftService.update('course', input, actor, { ipAddress: null, userAgent: null }, []),
    ).rejects.toMatchObject({ statusCode: 409, code: 'TRAINING_COURSE_STALE' });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it('rejects uploaded files that do not match payload upload keys', async () => {
    await expect(
      courseDraftService.update('course', input, actor, { ipAddress: null, userAgent: null }, [
        {
          key: 'e2ef8324-9ac0-4e7f-b16d-50050274a72e',
          storageKey: 'training-materials/file',
          originalName: 'guide.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          checksum: 'hash',
        },
      ]),
    ).rejects.toMatchObject({ statusCode: 422, code: 'TRAINING_FILES_MISMATCH' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
