import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({
  riskRegisterRepository: { findActor: vi.fn(), assessInherentRisk: vi.fn() },
}));

import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';

beforeEach(() => vi.clearAllMocks());

it('returns a conflict with an actionable reason when acceptance is pending', async () => {
  vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({
    id: 'officer', role: 'SECURITY_OFFICER', status: 'ACTIVE',
    user_access_scopes_user_access_scopes_user_idTousers: [],
  });
  vi.mocked(riskRegisterRepository.assessInherentRisk).mockResolvedValue({ kind: 'pending_acceptance' });
  await expect(riskRegisterService.assessInherentRisk('officer', 'risk', {
    likelihood: 3, impact: 4, assessmentReason: 'A documented inherent risk assessment basis.',
  })).rejects.toMatchObject({
    statusCode: 409,
    code: 'ACCEPTANCE_PENDING',
    message: 'This Risk has a pending acceptance request. Changes are unavailable until the request is resolved.',
  });
});
