import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ approveTreatmentPlan: vi.fn() }));

vi.mock('../src/modules/risk-management/risk-management.repository.js', () => ({
  riskManagementRepository: mocks,
}));

import { riskManagementService } from '../src/modules/risk-management/risk-management.service.js';

const planId = '4e3bf41b-32fb-4461-9740-9c2e68a6ff84';
const input = { approvalRequestId: '11111111-1111-4111-8111-111111111111' };
const actor = {
  userId: '22222222-2222-4222-8222-222222222222',
  permissions: ['risk-treatment-plans.approve'],
};
const context = { ipAddress: null, userAgent: null };

describe('approve risk treatment plan service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the approve permission', async () => {
    await expect(
      riskManagementService.approveTreatmentPlan(
        planId,
        input,
        { ...actor, permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('returns workflow progress after a valid decision', async () => {
    const result = {
      treatmentPlanId: planId,
      riskAssessmentId: '33333333-3333-4333-8333-333333333333',
      approvalRequestId: input.approvalRequestId,
      planStatus: 'approved',
      approvalStatus: 'approved',
      currentStep: 1,
      stepCompleted: true,
      approvalCount: 1,
      requiredApprovals: 1,
    };
    mocks.approveTreatmentPlan.mockResolvedValueOnce({ failure: null, result });
    await expect(
      riskManagementService.approveTreatmentPlan(planId, input, actor, context),
    ).resolves.toEqual(result);
  });

  it('maps self approval, duplicate decisions, and changed snapshots', async () => {
    mocks.approveTreatmentPlan.mockResolvedValueOnce({ failure: 'SELF_APPROVAL', result: null });
    await expect(
      riskManagementService.approveTreatmentPlan(planId, input, actor, context),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SELF_APPROVAL_NOT_ALLOWED' });

    mocks.approveTreatmentPlan.mockResolvedValueOnce({ failure: 'ALREADY_DECIDED', result: null });
    await expect(
      riskManagementService.approveTreatmentPlan(planId, input, actor, context),
    ).rejects.toMatchObject({ statusCode: 409, code: 'APPROVAL_ALREADY_RECORDED' });

    mocks.approveTreatmentPlan.mockResolvedValueOnce({ failure: 'PLAN_CHANGED', result: null });
    await expect(
      riskManagementService.approveTreatmentPlan(planId, input, actor, context),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'TREATMENT_PLAN_CHANGED_AFTER_SUBMISSION',
    });
  });
});
