import { beforeEach, describe, expect, it, vi } from 'vitest';
import { riskReassessmentReviewRepository } from '../src/modules/risk-assessment/risk-reassessment-review.repository.js';
import { riskReassessmentReviewService } from '../src/modules/risk-assessment/risk-reassessment-review.service.js';

vi.mock('../src/modules/risk-assessment/risk-reassessment-review.repository.js', () => ({
  riskReassessmentReviewRepository: {
    findActor: vi.fn(),
    listOwned: vi.fn(),
    findById: vi.fn(),
    startReview: vi.fn(),
    reject: vi.fn(),
    complete: vi.fn(),
  },
}));

const ownerId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const request = {
  id: requestId,
  reason: 'The incident invalidates assumptions in the current assessment.',
  status: 'PENDING' as const,
  requested_at: new Date(),
  reviewed_at: null,
  review_comment: null,
  risks: {
    id: '33333333-3333-4333-8333-333333333333',
    risk_code: 'RISK-1',
    title: 'Compromise',
    status: 'OPEN' as const,
    owner_user_id: ownerId,
    risk_assessments: [],
    risk_treatment_plans: [],
  },
  incidents: {
    id: '44444444-4444-4444-8444-444444444444',
    incident_code: 'INC-1',
    title: 'Login',
    severity: 'HIGH' as const,
  },
  control_findings: null,
  users_risk_reassessment_requests_requested_byTousers: {
    id: '55555555-5555-4555-8555-555555555555',
    full_name: 'Security Officer',
  },
  users_risk_reassessment_requests_reviewed_byTousers: null,
};

describe('riskReassessmentReviewService.startReview', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires an active user', async () => {
    vi.mocked(riskReassessmentReviewRepository.findActor).mockResolvedValue(null);
    await expect(
      riskReassessmentReviewService.startReview(ownerId, requestId),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
  it('requires the assigned Risk Owner', async () => {
    vi.mocked(riskReassessmentReviewRepository.findActor).mockResolvedValue({
      id: ownerId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    vi.mocked(riskReassessmentReviewRepository.findById).mockResolvedValue({
      ...request,
      risks: { ...request.risks, owner_user_id: '66666666-6666-4666-8666-666666666666' },
    });
    await expect(
      riskReassessmentReviewService.startReview(ownerId, requestId),
    ).rejects.toMatchObject({ code: 'RISK_OWNER_REQUIRED' });
  });
  it('starts review without changing the risk', async () => {
    vi.mocked(riskReassessmentReviewRepository.findActor).mockResolvedValue({
      id: ownerId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    vi.mocked(riskReassessmentReviewRepository.findById).mockResolvedValue(request);
    vi.mocked(riskReassessmentReviewRepository.startReview).mockResolvedValue({
      ...request,
      status: 'UNDER_REVIEW',
    });
    const result = await riskReassessmentReviewService.startReview(ownerId, requestId);
    expect(result.status).toBe('under_review');
    expect(riskReassessmentReviewRepository.startReview).toHaveBeenCalledWith(requestId, ownerId);
  });
});

describe('riskReassessmentReviewService.complete', () => {
  beforeEach(() => vi.clearAllMocks());
  it('completes an under-review request and updates its treatment plan', async () => {
    vi.mocked(riskReassessmentReviewRepository.findActor).mockResolvedValue({
      id: ownerId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    vi.mocked(riskReassessmentReviewRepository.findById).mockResolvedValue({
      ...request,
      status: 'UNDER_REVIEW',
    });
    vi.mocked(riskReassessmentReviewRepository.complete).mockResolvedValue({
      kind: 'completed',
      assessment: { id: requestId, residual_rating: 'MEDIUM' },
      treatmentPlan: {
        id: requestId,
        title: 'Mitigation',
        status: 'ACTIVE',
        target_completion_date: new Date('2027-01-01'),
      },
      score: 9,
      completedAt: new Date(),
    });
    const result = await riskReassessmentReviewService.complete(ownerId, requestId, {
      residualLikelihood: 3,
      residualImpact: 3,
      controlEffectiveness: 70,
      assessmentReason: 'Controls reduce likelihood but the incident shows remaining exposure.',
      treatmentPlanId: requestId,
      treatmentPlanStatus: 'active',
      targetDate: '2027-01-01',
    });
    expect(result).toMatchObject({
      status: 'completed',
      residualScore: 9,
      residualRating: 'medium',
    });
  });
});

describe('riskReassessmentReviewService.reject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a pending request without changing the risk', async () => {
    vi.mocked(riskReassessmentReviewRepository.findActor).mockResolvedValue({
      id: ownerId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    vi.mocked(riskReassessmentReviewRepository.findById).mockResolvedValue(request);
    const reviewedAt = new Date();
    vi.mocked(riskReassessmentReviewRepository.reject).mockResolvedValue({ reviewedAt });
    const reason = 'The incident does not change the assumptions for this risk.';
    const result = await riskReassessmentReviewService.reject(ownerId, requestId, { reason });
    expect(result).toEqual({ requestId, status: 'rejected', reason, reviewedAt });
  });

  it('requires the assigned Risk Owner', async () => {
    vi.mocked(riskReassessmentReviewRepository.findActor).mockResolvedValue({
      id: ownerId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(riskReassessmentReviewRepository.findById).mockResolvedValue({
      ...request,
      risks: { ...request.risks, owner_user_id: '66666666-6666-4666-8666-666666666666' },
    });
    await expect(
      riskReassessmentReviewService.reject(ownerId, requestId, {
        reason: 'The incident does not change the assumptions for this risk.',
      }),
    ).rejects.toMatchObject({ code: 'RISK_OWNER_REQUIRED' });
  });
});
