import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({ riskRegisterRepository: {
  findActor: vi.fn(), findTreatmentPlanScope: vi.fn(), treatmentPlanOptions: vi.fn(),
} }));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';
describe('treatment options authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({ user_access_scopes_user_access_scopes_user_idTousers: [], id: 'owner', role: 'EMPLOYEE', status: 'ACTIVE' });
    vi.mocked(riskRegisterRepository.findTreatmentPlanScope).mockResolvedValue({ owner_user_id: 'owner' });
    vi.mocked(riskRegisterRepository.treatmentPlanOptions).mockResolvedValue([[], []]);
  });
  it('allows an assigned owner', async () => {
    await expect(riskRegisterService.treatmentPlanOptions('owner', { riskId: 'risk', q: '', limit: 10 })).resolves.toEqual({ users: [], controls: [] });
  });
  it('rejects another employee before loading options', async () => {
    await expect(riskRegisterService.treatmentPlanOptions('other', { riskId: 'risk', q: '', limit: 10 })).rejects.toMatchObject({ statusCode: 403 });
    expect(riskRegisterRepository.treatmentPlanOptions).not.toHaveBeenCalled();
  });
  it('rejects unscoped employee lookup', async () => {
    await expect(riskRegisterService.treatmentPlanOptions('owner', { q: '', limit: 10 })).rejects.toMatchObject({ statusCode: 403 });
    expect(riskRegisterRepository.treatmentPlanOptions).not.toHaveBeenCalled();
  });
});
