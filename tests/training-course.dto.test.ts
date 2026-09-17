import { describe, expect, it } from 'vitest';
import {
  createCourseBodySchema,
  listCoursesQuerySchema,
} from '../src/modules/training-awareness/dto/course.dto.js';

describe('training course DTOs', () => {
  it('accepts a bounded draft', () => {
    expect(
      createCourseBodySchema.parse({
        title: 'Phishing basics',
        content: 'Learn to identify suspicious messages.',
      }).title,
    ).toBe('Phishing basics');
  });
  it('rejects blank content and unknown fields', () => {
    expect(createCourseBodySchema.safeParse({ title: 'Phishing', content: '   ' }).success).toBe(
      false,
    );
    expect(
      createCourseBodySchema.safeParse({
        title: 'Phishing',
        content: 'Valid course content',
        status: 'published',
      }).success,
    ).toBe(false);
  });
  it('bounds pagination', () => {
    expect(listCoursesQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
  it('accepts only supported course status filters', () => {
    expect(listCoursesQuerySchema.parse({ status: 'published' }).status).toBe('published');
    expect(listCoursesQuerySchema.safeParse({ status: 'inactive' }).success).toBe(false);
  });
  it('accepts a multiple-answer assessment question', () => {
    expect(
      createCourseBodySchema.safeParse({
        title: 'Password security',
        content: 'Learn how to protect corporate accounts.',
        status: 'published',
        assessment: {
          title: 'Password security assessment',
          passingScore: 80,
          maxAttempts: 3,
          questions: [
            {
              type: 'multiple_choice',
              text: 'Which practices protect an account?',
              options: [
                { text: 'Use MFA', isCorrect: true },
                { text: 'Use a password manager', isCorrect: true },
                { text: 'Reuse passwords', isCorrect: false },
              ],
            },
          ],
        },
      }).success,
    ).toBe(true);
  });
});
