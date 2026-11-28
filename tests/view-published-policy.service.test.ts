import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({ policyComplianceRepository: { findActor: vi.fn(), listOwnedPublishedPolicies: vi.fn(), listPublishedPoliciesForEmployee: vi.fn(), findPublishedPolicyForEmployee: vi.fn(), createPolicyAcknowledgement: vi.fn() } }));
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
      policies_policy_versions_policy_idTopolicies: { policy_code: 'ISP-001', title: 'Security policy', description: null, policy_versions_policy_versions_policy_idTopolicies: [] }, policy_acknowledgements: [],
    });
    await expect(policyComplianceService.getPublishedPolicyForEmployee(userId, policyId, versionId)).resolves.toMatchObject({ policyCode: 'ISP-001', version: { content: 'Official content' }, acknowledgedAt: null });
  });
  it('returns a v1 confirmation separately from unacknowledged current v2 in list and detail', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({ id: userId, role: 'EMPLOYEE', status: 'ACTIVE' });
    const oldId = '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81';
    const at = new Date('2026-09-02T00:00:00Z');
    const previous = [{ id: oldId, version_number: '1.0', policy_acknowledgements: [{ acknowledged_at: at }] }];
    const current = { id: versionId, version_number: '2.0', content: 'New content', change_summary: 'Added MFA', status: 'PUBLISHED' as const, author_user_id: userId, created_at: at, published_at: at, policy_acknowledgements: [] };
    vi.mocked(policyComplianceRepository.listPublishedPoliciesForEmployee).mockResolvedValue([1, [{ id: policyId, policy_code: 'ISP-001', title: 'Policy', description: null, policy_versions_policy_versions_policy_idTopolicies: previous, policy_versions_policies_current_published_version_idTopolicy_versions: current }]]);
    vi.mocked(policyComplianceRepository.findPublishedPolicyForEmployee).mockResolvedValue({ ...current, policy_id: policyId, policies_policy_versions_policy_idTopolicies: { policy_code: 'ISP-001', title: 'Policy', description: null, policy_versions_policy_versions_policy_idTopolicies: previous } });
    const expected = { acknowledgedAt: null, previousAcknowledgement: { versionId: oldId, versionNumber: '1.0', acknowledgedAt: at } };
    expect((await policyComplianceService.listPublishedPoliciesForEmployee(userId, { page: 1, limit: 20, status: 'pending' })).items[0]).toMatchObject({ ...expected, versionNumber: '2.0', changeSummary: 'Added MFA' });
    expect(await policyComplianceService.getPublishedPolicyForEmployee(userId, policyId, versionId)).toMatchObject(expected);
  });
  it('rejects roles outside the WBS actors', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({ id: userId, role: 'ADMIN', status: 'ACTIVE' });
    await expect(policyComplianceService.listOwnedPublishedPolicies(userId)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('records an Employee acknowledgement for the current published version', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({ id: userId, role: 'EMPLOYEE', status: 'ACTIVE' });
    vi.mocked(policyComplianceRepository.findPublishedPolicyForEmployee).mockResolvedValue({ id: versionId } as never);
    vi.mocked(policyComplianceRepository.createPolicyAcknowledgement).mockResolvedValue({ acknowledged_at: new Date('2026-09-30T00:00:00Z'), alreadyAcknowledged: false });
    await expect(policyComplianceService.acknowledgePublishedPolicy(userId, policyId, versionId)).resolves.toEqual({
      policyId,
      versionId,
      acknowledgedAt: new Date('2026-09-30T00:00:00Z'),
      alreadyAcknowledged: false,
    });
    expect(policyComplianceRepository.createPolicyAcknowledgement).toHaveBeenCalledWith(policyId, versionId, userId);
  });
  it('returns an existing acknowledgement without duplicating it', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({ id: userId, role: 'EMPLOYEE', status: 'ACTIVE' });
    vi.mocked(policyComplianceRepository.findPublishedPolicyForEmployee).mockResolvedValue({ id: versionId } as never);
    vi.mocked(policyComplianceRepository.createPolicyAcknowledgement).mockResolvedValue({ acknowledged_at: new Date('2026-09-29T00:00:00Z'), alreadyAcknowledged: true });
    await expect(policyComplianceService.acknowledgePublishedPolicy(userId, policyId, versionId)).resolves.toMatchObject({ alreadyAcknowledged: true });
  });
  it('does not acknowledge a version that is not the current published policy', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({ id: userId, role: 'EMPLOYEE', status: 'ACTIVE' });
    vi.mocked(policyComplianceRepository.findPublishedPolicyForEmployee).mockResolvedValue(null);
    await expect(policyComplianceService.acknowledgePublishedPolicy(userId, policyId, versionId)).rejects.toMatchObject({ statusCode: 404 });
    expect(policyComplianceRepository.createPolicyAcknowledgement).not.toHaveBeenCalled();
  });
});
