import { describe, expect, it } from 'vitest';
import { createCourseBodySchema, courseMaterialSchema, courseLessonSchema } from './course.dto.js';

const lesson = {
  title: 'Spot phishing',
  isRequired: true,
  materials: [{ title: 'Introduction', type: 'text', content: 'Check the sender.' }],
};
const base = {
  title: 'Security basics',
  content: 'Learn to identify security threats.',
  status: 'draft',
  lessons: [lesson],
};
describe('structured course creation', () => {
  it('accepts lessons in a draft', () =>
    expect(createCourseBodySchema.safeParse(base).success).toBe(true));
  it('requires at least one material', () =>
    expect(courseLessonSchema.safeParse({ ...lesson, materials: [] }).success).toBe(false));
  it('rejects structured direct publication', () =>
    expect(createCourseBodySchema.safeParse({ ...base, status: 'published' }).success).toBe(false));
  it.each(['http://example.com', 'not a URL', 'https://user:password@example.com'])(
    'rejects unsafe URL %s',
    (externalUrl) => {
      expect(
        courseMaterialSchema.safeParse({ title: 'Resource', type: 'link', externalUrl }).success,
      ).toBe(false);
    },
  );
  it('rejects conflicting sources', () =>
    expect(
      courseMaterialSchema.safeParse({
        title: 'Video',
        type: 'video',
        externalUrl: 'https://example.com/video',
        uploadKey: 'bd0f9a82-9f79-4ae3-a2a2-6b20d142fd89',
      }).success,
    ).toBe(false));
  it('does not accept arbitrary existing file IDs', () =>
    expect(
      courseMaterialSchema.safeParse({
        title: 'PDF',
        type: 'document',
        fileId: 'bd0f9a82-9f79-4ae3-a2a2-6b20d142fd89',
      }).success,
    ).toBe(false));
  it('requires unique upload keys', () => {
    const material = {
      title: 'PDF',
      type: 'document',
      uploadKey: 'bd0f9a82-9f79-4ae3-a2a2-6b20d142fd89',
    };
    expect(
      createCourseBodySchema.safeParse({
        ...base,
        lessons: [{ ...lesson, materials: [material, material] }],
      }).success,
    ).toBe(false);
  });
});
