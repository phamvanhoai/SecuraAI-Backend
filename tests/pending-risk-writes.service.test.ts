import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({
  riskRegisterRepository: {
    findActor: vi.fn(), identifyThreat: vi.fn(), updateThreat: vi.fn(),
    identifyVulnerability: vi.fn(), updateVulnerability: vi.fn(),
    assessResidualRisk: vi.fn(), defineTargetRisk: vi.fn(),
    createTreatmentPlan: vi.fn(), updateTreatmentPlan: vi.fn(),
  },
}));
import { riskRegisterRepository as repository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { riskRegisterService as service } from '../src/modules/risk-assessment/risk-register.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.findActor).mockResolvedValue({ id: 'actor', role: 'SECURITY_OFFICER', status: 'ACTIVE', user_access_scopes_user_access_scopes_user_idTousers: [] });
  vi.mocked(repository.identifyThreat).mockResolvedValue({ kind: 'pending_acceptance' });
  vi.mocked(repository.updateThreat).mockResolvedValue({ kind: 'pending_acceptance' });
  vi.mocked(repository.identifyVulnerability).mockResolvedValue({ kind: 'pending_acceptance' });
  vi.mocked(repository.updateVulnerability).mockResolvedValue({ kind: 'pending_acceptance' });
  vi.mocked(repository.assessResidualRisk).mockResolvedValue({ kind: 'pending_acceptance' });
  vi.mocked(repository.defineTargetRisk).mockResolvedValue({ kind: 'pending_acceptance' });
  vi.mocked(repository.createTreatmentPlan).mockResolvedValue({ kind: 'pending_acceptance' });
  vi.mocked(repository.updateTreatmentPlan).mockResolvedValue({ kind: 'pending_acceptance' });
});

const threat = { name: 'Threat', description: 'Demo scenario', vulnerabilityIds: [] };
const vulnerability = { name: 'Weakness', description: 'Demo scenario', controlIds: [] };
const revision = '2026-11-09T00:00:00Z';
const cases: Array<[string, () => Promise<unknown>]> = [
  ['Identify Threat', () => service.identifyThreat('actor', 'risk', threat)],
  ['Edit Threat', () => service.updateThreat('actor', 'risk', 'threat', { ...threat, expectedUpdatedAt: revision })],
  ['Identify Vulnerability', () => service.identifyVulnerability('actor', 'risk', vulnerability)],
  ['Edit Vulnerability', () => service.updateVulnerability('actor', 'risk', 'vulnerability', { ...vulnerability, expectedUpdatedAt: revision })],
  ['Assess Residual', () => service.assessResidualRisk('actor', 'risk', { likelihood: 2, impact: 3, targetRisk: 'low', riskAppetite: 'medium', riskTolerance: 'medium', assessmentReason: 'Demo current basis' })],
  ['Define Target', () => service.defineTargetRisk('actor', 'risk', { treatmentPlanId: 'plan', targetRisk: 'low', rationale: 'Demo target rationale' })],
  ['Create Plan', () => service.createTreatmentPlan('actor', { riskId: 'risk', title: 'Demo plan', strategy: 'avoid', ownerUserId: 'actor', targetDate: '2099-12-31', targetRisk: 'low', controlIds: [], actions: [] })],
  ['Update Plan/Actions', () => service.updateTreatmentPlan('actor', 'plan', { title: 'Demo plan', strategy: 'avoid', ownerUserId: 'actor', targetDate: '2099-12-31', status: 'active', expectedUpdatedAt: revision, controlIds: [], actions: [] })],
];
it.each(cases)('%s returns the common pending conflict', async (_name, invoke) => {
  await expect(invoke()).rejects.toMatchObject({ statusCode: 409, code: 'ACCEPTANCE_PENDING', message: 'This Risk has a pending acceptance request. Changes are unavailable until the request is resolved.' });
});
