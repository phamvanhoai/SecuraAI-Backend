import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    findReviewableDraft: vi.fn(),
    approveDraftForPublication: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const authorId = '38ee9371-a84b-4409-b5a8-8e7bb16d5081';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const decidedAt = new Date('2026-09-26T00:00:00Z');

function version(status: 'IN_REVIEW' | 'APPROVED' = 'IN_REVIEW') {
  return {
    id: versionId,
    policy_id: policyId,
    version_number: '1.0',
    content: 'Required controls',
    change_summary: null,
    status,
    author_user_id: authorId,
    created_at: decidedAt,
    policies_policy_versions_policy_idTopolicies: {
      policy_code: 'ISP-001',
      title: 'Security policy',
      description: null,
      owner_user_id: authorId,
      status: 'DRAFT' as const,
      updated_at: decidedAt,
    },
  };
}

describe('approve policy for publication service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue(version());
    vi.mocked(policyComplianceRepository.approveDraftForPublication).mockResolvedValue({
      version: version('APPROVED'),
      decision: {
        id: '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81',
        action: 'APPROVED',
        actor_user_id: adminId,
        comment: null,
        decided_at: decidedAt,
      },
    });
  });

  it('records approval and leaves publication as a separate step', async () => {
    const result = await policyComplianceService.approveForPublication(
      adminId,
      policyId,
      versionId,
    );
    expect(policyComplianceRepository.approveDraftForPublication).toHaveBeenCalledWith(
      policyId,
      versionId,
      adminId,
    );
    expect(result).toMatchObject({
      policyId,
      version: { status: 'approved' },
      decision: { action: 'APPROVED', actorUserId: adminId },
    });
  });

  it('rejects a non-Admin actor', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    await expect(
      policyComplianceService.approveForPublication(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(policyComplianceRepository.findReviewableDraft).not.toHaveBeenCalled();
  });

  it('rejects a version that is not awaiting an Admin decision', async () => {
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue(null);
    await expect(
      policyComplianceService.approveForPublication(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 404, code: 'POLICY_DRAFT_NOT_FOUND' });
  });

  it('rejects a concurrent decision', async () => {
    vi.mocked(policyComplianceRepository.approveDraftForPublication).mockResolvedValue(null);
    await expect(
      policyComplianceService.approveForPublication(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_DRAFT_CHANGED' });
  });
});
