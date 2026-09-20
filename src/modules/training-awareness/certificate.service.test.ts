import { beforeEach, describe, expect, it, vi } from 'vitest';
import { certificateService } from './certificate.service.js';

const repositoryMocks = vi.hoisted(() => ({
  get: vi.fn(),
  issue: vi.fn(),
}));

vi.mock('./certificate.repository.js', () => ({
  certificateRepository: repositoryMocks,
}));

const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['training-completion.read', 'training-certificates.issue'],
};

const result = {
  enrollment: {
    training_enrollment_id: '00000000-0000-4000-8000-000000000002',
    user_id: '00000000-0000-4000-8000-000000000003',
    status: 'completed',
    progress_percent: 100,
    completed_at: new Date('2026-09-18T03:00:00.000Z'),
    users: { full_name: 'Alex Morgan' },
    training_certificates: null,
    training_campaigns: {
      title: 'September campaign',
      training_courses: {
        title: 'Phishing awareness',
        quizzes: [{ quiz_id: '00000000-0000-4000-8000-000000000004' }],
      },
    },
  },
  requirements: {
    courseCompleted: true,
    progressComplete: true,
    finalAssessmentRequired: true,
    finalAssessmentPassed: true,
  },
  eligible: true,
};

describe('certificateService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns enrollment-scoped eligibility requirements', async () => {
    repositoryMocks.get.mockResolvedValue(result);

    await expect(
      certificateService.get(result.enrollment.training_enrollment_id, actor),
    ).resolves.toMatchObject({
      eligible: true,
      requirements: result.requirements,
      certificate: null,
    });
  });

  it('requires completion read permission before loading certificate details', async () => {
    await expect(
      certificateService.get(result.enrollment.training_enrollment_id, {
        userId: actor.userId,
        permissions: [],
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repositoryMocks.get).not.toHaveBeenCalled();
  });

  it('maps an ineligible issuance to a conflict', async () => {
    repositoryMocks.issue.mockResolvedValue({ kind: 'ineligible' });

    await expect(
      certificateService.issue(result.enrollment.training_enrollment_id, actor, {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CERTIFICATE_NOT_ELIGIBLE' });
  });

  it('returns an existing certificate for an idempotent issue request', async () => {
    const issued = {
      ...result,
      enrollment: {
        ...result.enrollment,
        training_certificates: {
          training_certificate_id: '00000000-0000-4000-8000-000000000005',
          certificate_number: 'SEC-TR-EXISTING',
          issued_at: new Date('2026-09-18T04:00:00.000Z'),
          users: { full_name: 'Security Officer' },
        },
      },
    };
    repositoryMocks.issue.mockResolvedValue({ kind: 'issued', result: issued });

    await expect(
      certificateService.issue(result.enrollment.training_enrollment_id, actor, {
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      }),
    ).resolves.toMatchObject({
      certificate: { number: 'SEC-TR-EXISTING', issuedBy: 'Security Officer' },
    });
  });
});
