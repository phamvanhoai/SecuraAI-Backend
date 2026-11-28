import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({
  riskRegisterRepository: { findActor: vi.fn(), submitAcceptance: vi.fn(), createTreatmentPlan: vi.fn() },
}));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Vietnam is already on 29 November, while UTC is still on 28 November.
  vi.setSystemTime(new Date('2026-11-28T17:00:00Z'));
  vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({
    id: 'owner', role: 'EMPLOYEE', status: 'ACTIVE',
    user_access_scopes_user_access_scopes_user_idTousers: [],
  });
});
afterEach(() => vi.useRealTimers());

const acceptance = {
  residualLikelihood: 2, residualImpact: 2, assessmentReason: 'Current assessment basis.',
  treatmentPlanId: 'plan', acceptanceReason: 'Accept remaining exposure.', validUntil: '2026-11-28',
};
it('rejects an acceptance date that expired at Vietnam midnight', async () => {
  await expect(riskRegisterService.submitAcceptance('owner', 'risk', acceptance))
    .rejects.toMatchObject({ code: 'INVALID_VALID_UNTIL' });
  expect(riskRegisterRepository.submitAcceptance).not.toHaveBeenCalled();
});
it('allows the final validity day and continues to the workflow checks', async () => {
  vi.mocked(riskRegisterRepository.submitAcceptance).mockResolvedValue({ kind: 'review_in_progress' });
  await expect(riskRegisterService.submitAcceptance('owner', 'risk', { ...acceptance, validUntil: '2026-11-29' }))
    .rejects.toMatchObject({ code: 'RISK_REVIEW_IN_PROGRESS' });
  expect(riskRegisterRepository.submitAcceptance).toHaveBeenCalledOnce();
});

const plan = {
  riskId: 'risk', title: 'Mitigate remaining risk', strategy: 'mitigate' as const,
  ownerUserId: 'owner', targetDate: '2026-11-30', targetRisk: 'low' as const, controlIds: [],
  actions: [{ title: 'Verify access', assignedToUserId: 'owner', dueDate: '2026-11-30' }],
};
it.each(['plan', 'action'])('rejects a %s due date equal to today in Vietnam', async (field) => {
  const input = field === 'plan' ? { ...plan, targetDate: '2026-11-29' }
    : { ...plan, actions: [{ ...plan.actions[0], title: 'Verify access', assignedToUserId: 'owner', dueDate: '2026-11-29' }] };
  await expect(riskRegisterService.createTreatmentPlan('owner', input))
    .rejects.toMatchObject({ code: 'INVALID_DUE_DATE' });
  expect(riskRegisterRepository.createTreatmentPlan).not.toHaveBeenCalled();
});
it('allows tomorrow in Vietnam to continue to repository checks', async () => {
  vi.mocked(riskRegisterRepository.createTreatmentPlan).mockResolvedValue({ kind: 'risk_not_found' });
  await expect(riskRegisterService.createTreatmentPlan('owner', plan))
    .rejects.toMatchObject({ code: 'RISK_NOT_FOUND' });
  expect(riskRegisterRepository.createTreatmentPlan).toHaveBeenCalledOnce();
});
