import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ courseCreate: vi.fn(), auditCreate: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (operation: (transaction: unknown) => Promise<unknown>) =>
      operation({
        training_courses: { create: mocks.courseCreate },
        audit_logs: { create: mocks.auditCreate },
      }),
  },
}));

import { trainingAwarenessRepository } from '../src/modules/training-awareness/training-awareness.repository.js';

describe('training course assessment persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.courseCreate.mockResolvedValue({
      training_course_id: '00000000-0000-4000-8000-000000000001',
      title: 'Phishing awareness',
      description: null,
      content: 'Course content for employees',
      status: 'draft',
      created_by_user_id: '00000000-0000-4000-8000-000000000002',
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  it('creates the quiz, ordered questions, options and audit record atomically', async () => {
    await trainingAwarenessRepository.createCourse(
      {
        title: 'Phishing awareness',
        description: null,
        content: 'Course content for employees',
        status: 'draft',
        assessment: {
          title: 'Phishing assessment',
          passingScore: 80,
          maxAttempts: 3,
          questions: [
            {
              text: 'Which message is suspicious?',
              options: [
                { text: 'Unexpected reset link', isCorrect: true },
                { text: 'Expected internal notice', isCorrect: false },
              ],
            },
          ],
        },
      },
      {
        actorUserId: '00000000-0000-4000-8000-000000000002',
        ipAddress: null,
        userAgent: null,
      },
    );

    expect(mocks.courseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'draft',
          quizzes: {
            create: expect.objectContaining({
              passing_score: 80,
              max_attempts: 3,
              quiz_questions: {
                create: [
                  expect.objectContaining({
                    display_order: 1,
                    question_type: 'multiple_choice',
                    quiz_options: {
                      create: [
                        expect.objectContaining({ display_order: 1, is_correct: true }),
                        expect.objectContaining({ display_order: 2, is_correct: false }),
                      ],
                    },
                  }),
                ],
              },
            }),
          },
        }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'training_course.created',
        after_data: expect.objectContaining({ assessmentCreated: true, questionCount: 1 }),
      }),
    });
  });
});
