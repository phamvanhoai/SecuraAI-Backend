import { beforeEach, describe, expect, it, vi } from 'vitest';
import { certificateRepository } from './certificate.repository.js';

const mocks = vi.hoisted(() => ({
  findEnrollment: vi.fn(),
  findAttempt: vi.fn(),
}));

vi.mock('../../database/prisma.js', () => ({
  prisma: {
    training_enrollments: { findUnique: mocks.findEnrollment },
    quiz_attempts: { findFirst: mocks.findAttempt },
  },
}));

const enrollment = {
  training_enrollment_id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  status: 'completed',
  progress_percent: 100,
  completed_at: new Date('2026-09-18T03:00:00.000Z'),
  users: { full_name: 'Alex Morgan' },
  training_certificates: null,
  training_campaigns: {
    title: 'September campaign',
    training_courses: { title: 'Phishing awareness', quizzes: [] },
  },
};

describe('certificateRepository eligibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not require an assessment when the course has no final assessment', async () => {
    mocks.findEnrollment.mockResolvedValue(enrollment);

    await expect(
      certificateRepository.get(enrollment.training_enrollment_id),
    ).resolves.toMatchObject({
      eligible: true,
      requirements: {
        finalAssessmentRequired: false,
        finalAssessmentPassed: null,
      },
    });
    expect(mocks.findAttempt).not.toHaveBeenCalled();
    expect(mocks.findEnrollment.mock.calls[0]?.[0]).toMatchObject({
      select: {
        training_campaigns: {
          select: {
            training_courses: {
              select: { quizzes: { where: { training_lesson_id: null } } },
            },
          },
        },
      },
    });
  });

  it('accepts only a passing final assessment attempt from the same enrollment', async () => {
    const quizId = '00000000-0000-4000-8000-000000000003';
    mocks.findEnrollment.mockResolvedValue({
      ...enrollment,
      training_campaigns: {
        ...enrollment.training_campaigns,
        training_courses: {
          ...enrollment.training_campaigns.training_courses,
          quizzes: [{ quiz_id: quizId }],
        },
      },
    });
    mocks.findAttempt.mockResolvedValue({
      quiz_attempt_id: '00000000-0000-4000-8000-000000000004',
    });

    await expect(
      certificateRepository.get(enrollment.training_enrollment_id),
    ).resolves.toMatchObject({
      eligible: true,
      requirements: {
        finalAssessmentRequired: true,
        finalAssessmentPassed: true,
      },
    });
    expect(mocks.findAttempt).toHaveBeenCalledWith({
      where: {
        quiz_id: quizId,
        training_enrollment_id: enrollment.training_enrollment_id,
        passed: true,
        submitted_at: { not: null },
      },
      select: { quiz_attempt_id: true },
    });
  });
});
