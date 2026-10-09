import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    findReviewableDraft: vi.fn(),
    reviewDraft: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const authorId = '38ee9371-a84b-4409-b5a8-8e7bb16d5081';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const reviewedAt = new Date('2026-10-01T00:00:00Z');

function version(status: 'IN_REVIEW' | 'WAITING_APPROVAL') {
  return {
    id: versionId,
    policy_id: policyId,
    version_number: '1.0',
    content: 'Required controls',
    change_summary: null,
    status,
    author_user_id: authorId,
    created_at: reviewedAt,
    policies_policy_versions_policy_idTopolicies: {
      policy_code: 'ISP-001',
      title: 'Security policy',
      description: null,
      owner_user_id: authorId,
      status: 'DRAFT' as const,
      updated_at: reviewedAt,
    },
  };
}

describe('review policy service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue(
      version('IN_REVIEW'),
    );
    vi.mocked(policyComplianceRepository.reviewDraft).mockResolvedValue({
      version: version('WAITING_APPROVAL'),
      decision: {
        id: '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81',
        action: 'REVIEWED',
        actor_user_id: adminId,
        comment: null,
        decided_at: reviewedAt,
      },
    });
  });

  it('records review and moves the draft to waiting approval', async () => {
    await expect(policyComplianceService.reviewPolicy(adminId, policyId, versionId)).resolves.toMatchObject({
      version: { status: 'waiting_approval' },
      decision: { action: 'REVIEWED', actorUserId: adminId },
    });
    expect(policyComplianceRepository.reviewDraft).toHaveBeenCalledWith(
      policyId,
      versionId,
      adminId,
    );
  });

  it('requires an active Admin', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    await expect(
      policyComplianceService.reviewPolicy(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('does not record the review twice', async () => {
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue(
      version('WAITING_APPROVAL'),
    );
    await expect(
      policyComplianceService.reviewPolicy(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_ALREADY_REVIEWED' });
    expect(policyComplianceRepository.reviewDraft).not.toHaveBeenCalled();
  });
});
