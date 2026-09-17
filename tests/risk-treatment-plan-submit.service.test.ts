import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findTreatmentPlanForSubmission: vi.fn(),
  submitTreatmentPlan: vi.fn(),
}));

vi.mock('../src/modules/risk-management/risk-management.repository.js', () => ({
  riskManagementRepository: mocks,
}));

import { riskManagementService } from '../src/modules/risk-management/risk-management.service.js';

const planId = '4e3bf41b-32fb-4461-9740-9c2e68a6ff84';
const actor = {
  userId: '11111111-1111-4111-8111-111111111111',
  permissions: ['risk-treatment-plans.submit'],
  roles: ['SECURITY_OFFICER'],
};
const input = { expectedUpdatedAt: '2026-09-16T10:00:00.000Z' };
const context = { ipAddress: null, userAgent: null };
const current = {
  risk_treatment_plan_id: planId,
  created_by_user_id: actor.userId,
  owner_user_id: '22222222-2222-4222-8222-222222222222',
  status: 'draft',
  updated_at: new Date(input.expectedUpdatedAt),
};

describe('submit risk treatment plan service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires permission, existence, and plan ownership', async () => {
    await expect(
      riskManagementService.submitTreatmentPlan(
        planId,
        input,
        { ...actor, permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    mocks.findTreatmentPlanForSubmission.mockResolvedValueOnce(null);
    await expect(
      riskManagementService.submitTreatmentPlan(planId, input, actor, context),
    ).rejects.toMatchObject({ statusCode: 404, code: 'TREATMENT_PLAN_NOT_FOUND' });

    mocks.findTreatmentPlanForSubmission.mockResolvedValueOnce({
      ...current,
      created_by_user_id: '33333333-3333-4333-8333-333333333333',
    });
    await expect(
      riskManagementService.submitTreatmentPlan(planId, input, actor, context),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('returns the approval request created by a valid submission', async () => {
    const result = {
      treatmentPlanId: planId,
      riskAssessmentId: '44444444-4444-4444-8444-444444444444',
      status: 'pending_approval',
      submittedAt: new Date('2026-09-16T10:05:00.000Z'),
      approvalRequestId: '55555555-5555-4555-8555-555555555555',
      approvalStatus: 'pending',
      currentStep: 1,
    };
    mocks.findTreatmentPlanForSubmission.mockResolvedValueOnce(current);
    mocks.submitTreatmentPlan.mockResolvedValueOnce({ failure: null, result });

    await expect(
      riskManagementService.submitTreatmentPlan(planId, input, actor, context),
    ).resolves.toEqual(result);
  });

  it('maps readiness and workflow failures to actionable API errors', async () => {
    mocks.findTreatmentPlanForSubmission.mockResolvedValue(current);
    mocks.submitTreatmentPlan.mockResolvedValueOnce({
      failure: 'ACTIONS_REQUIRED',
      result: null,
    });
    await expect(
      riskManagementService.submitTreatmentPlan(planId, input, actor, context),
    ).rejects.toMatchObject({ statusCode: 422, code: 'TREATMENT_ACTIONS_REQUIRED' });

    mocks.submitTreatmentPlan.mockResolvedValueOnce({
      failure: 'ALREADY_SUBMITTED',
      result: null,
    });
    await expect(
      riskManagementService.submitTreatmentPlan(planId, input, actor, context),
    ).rejects.toMatchObject({ statusCode: 409, code: 'TREATMENT_PLAN_ALREADY_SUBMITTED' });
  });
});
