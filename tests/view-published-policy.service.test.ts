import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({ policyComplianceRepository: { findActor: vi.fn(), listOwnedPublishedPolicies: vi.fn(), listPublishedPoliciesForEmployee: vi.fn(), findPublishedPolicyForEmployee: vi.fn() } }));
import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';
const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
describe('view published policy service', () => {
  beforeEach(() => vi.clearAllMocks());
  it('limits the Security Officer list to owned policies', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({ id: userId, role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(policyComplianceRepository.listOwnedPublishedPolicies).mockResolvedValue([]);
    await expect(policyComplianceService.listOwnedPublishedPolicies(userId)).resolves.toEqual([]);
    expect(policyComplianceRepository.listOwnedPublishedPolicies).toHaveBeenCalledWith(userId);
  });
  it('returns published content to an Employee', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({ id: userId, role: 'EMPLOYEE', status: 'ACTIVE' });
    vi.mocked(policyComplianceRepository.findPublishedPolicyForEmployee).mockResolvedValue({
      id: versionId, policy_id: policyId, version_number: '1.0', content: 'Official content', change_summary: null, status: 'PUBLISHED', author_user_id: userId,
      created_at: new Date('2026-09-01T00:00:00Z'), published_at: new Date('2026-09-02T00:00:00Z'),
      policies_policy_versions_policy_idTopolicies: { policy_code: 'ISP-001', title: 'Security policy', description: null }, policy_acknowledgements: [],
    });
    await expect(policyComplianceService.getPublishedPolicyForEmployee(userId, policyId, versionId)).resolves.toMatchObject({ policyCode: 'ISP-001', version: { content: 'Official content' }, acknowledgedAt: null });
  });
  it('rejects roles outside the WBS actors', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({ id: userId, role: 'ADMIN', status: 'ACTIVE' });
    await expect(policyComplianceService.listOwnedPublishedPolicies(userId)).rejects.toMatchObject({ statusCode: 403 });
  });
});
