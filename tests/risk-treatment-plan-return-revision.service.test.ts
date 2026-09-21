import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ returnTreatmentPlanForRevision: vi.fn() }));

vi.mock('../src/modules/risk-management/risk-management.repository.js', () => ({
  riskManagementRepository: mocks,
}));

import { riskManagementService } from '../src/modules/risk-management/risk-management.service.js';

const planId = '4e3bf41b-32fb-4461-9740-9c2e68a6ff84';
const input = {
  approvalRequestId: '11111111-1111-4111-8111-111111111111',
  revisionScope: 'both' as const,
  reason: 'Clarify the risk score and treatment deadlines.',
};
const actor = {
  userId: '22222222-2222-4222-8222-222222222222',
  permissions: ['risk-treatment-plans.approve'],
};
const context = { ipAddress: null, userAgent: null };

describe('return risk assessment and treatment plan for revision service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires approval permission', async () => {
    await expect(
      riskManagementService.returnTreatmentPlanForRevision(
        planId,
        input,
        { ...actor, permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('returns the rejected states after a valid decision', async () => {
    const result = {
      treatmentPlanId: planId,
      riskAssessmentId: '33333333-3333-4333-8333-333333333333',
      approvalRequestId: input.approvalRequestId,
      planStatus: 'rejected',
      riskStatus: 'rejected',
      approvalStatus: 'rejected',
      revisionScope: input.revisionScope,
      reason: input.reason,
      returnedAt: new Date('2026-09-21T10:00:00.000Z'),
    };
    mocks.returnTreatmentPlanForRevision.mockResolvedValueOnce({ failure: null, result });
    await expect(
      riskManagementService.returnTreatmentPlanForRevision(planId, input, actor, context),
    ).resolves.toEqual(result);
  });

  it.each([
    ['SELF_REVIEW', 403, 'SELF_REVIEW_NOT_ALLOWED'],
    ['NOT_CURRENT_APPROVER', 403, 'NOT_CURRENT_APPROVER'],
    ['ALREADY_DECIDED', 409, 'APPROVAL_ALREADY_RECORDED'],
    ['REQUEST_NOT_PENDING', 409, 'APPROVAL_REQUEST_NOT_PENDING'],
    ['SUBMISSION_CHANGED', 409, 'SUBMISSION_CHANGED_AFTER_SUBMISSION'],
  ] as const)('maps %s to an actionable API error', async (failure, statusCode, code) => {
    mocks.returnTreatmentPlanForRevision.mockResolvedValueOnce({ failure, result: null });
    await expect(
      riskManagementService.returnTreatmentPlanForRevision(planId, input, actor, context),
    ).rejects.toMatchObject({ statusCode, code });
  });
});
