import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    findReviewableDraft: vi.fn(),
    rejectDraft: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const authorId = '38ee9371-a84b-4409-b5a8-8e7bb16d5081';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const decidedAt = new Date('2026-09-26T00:00:00Z');
const reason = 'Required publication controls are incomplete.';

function version(status: 'IN_REVIEW' | 'REJECTED' = 'IN_REVIEW') {
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
      policy_code: 'ISP-001', title: 'Security policy', description: null,
      owner_user_id: authorId, status: 'DRAFT' as const, updated_at: decidedAt,
    },
  };
}

describe('reject policy service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId, role: 'ADMIN', status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue(version());
    vi.mocked(policyComplianceRepository.rejectDraft).mockResolvedValue({
      version: version('REJECTED'),
      decision: {
        id: '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81', action: 'REJECTED',
        actor_user_id: adminId, comment: reason, decided_at: decidedAt,
      },
    });
  });

  it('records the rejection reason and rejects the submitted version', async () => {
    const result = await policyComplianceService.rejectPolicy(
      adminId, policyId, versionId, { reason },
    );
    expect(policyComplianceRepository.rejectDraft).toHaveBeenCalledWith(
      policyId, versionId, adminId, { reason },
    );
    expect(result).toMatchObject({
      version: { status: 'rejected' },
      decision: { action: 'REJECTED', comment: reason },
    });
  });

  it('requires an active Admin', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId, role: 'SECURITY_OFFICER', status: 'ACTIVE',
    });
    await expect(
      policyComplianceService.rejectPolicy(adminId, policyId, versionId, { reason }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a concurrent decision', async () => {
    vi.mocked(policyComplianceRepository.rejectDraft).mockResolvedValue(null);
    await expect(
      policyComplianceService.rejectPolicy(adminId, policyId, versionId, { reason }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_DRAFT_CHANGED' });
  });
});
