import { expect, it, vi } from 'vitest';
vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({ riskRegisterRepository: { findActor: vi.fn(), submitAcceptance: vi.fn() } }));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';
it('returns an actionable conflict for direct acceptance requests during review', async () => {
  vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({ user_access_scopes_user_access_scopes_user_idTousers: [], id: 'owner', role: 'EMPLOYEE', status: 'ACTIVE' });
  vi.mocked(riskRegisterRepository.submitAcceptance).mockResolvedValue({ kind: 'review_in_progress' });
  await expect(riskRegisterService.submitAcceptance('owner', 'risk', {
    residualLikelihood: 2, residualImpact: 2, assessmentReason: 'Verified current remaining risk.', treatmentPlanId: 'plan',
    validUntil: '2099-01-01', acceptanceReason: 'Accept current remaining exposure.',
  })).rejects.toMatchObject({ statusCode: 409, code: 'RISK_REVIEW_IN_PROGRESS', message: 'Complete Risk Review before submitting a new acceptance request.' });
});
