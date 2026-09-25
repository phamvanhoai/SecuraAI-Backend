import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    findDraftForSubmission: vi.fn(),
    submitDraft: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';
const versionId = 'ec178d52-2959-47fd-93db-aa693158668c';
const createdAt = new Date('2026-09-25T01:00:00Z');
const updatedAt = new Date('2026-09-25T02:00:00Z');

function draft(status: 'DRAFT' | 'IN_REVIEW' = 'DRAFT') {
  return {
    id: versionId,
    policy_id: policyId,
    version_number: '1.0',
    status,
    author_user_id: userId,
    created_at: createdAt,
    policies_policy_versions_policy_idTopolicies: {
      id: policyId,
      policy_code: 'TEST',
      title: 'Test policy',
      owner_user_id: userId,
      status: 'DRAFT' as const,
      updated_at: updatedAt,
    },
  };
}

describe('submit policy for review service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
    vi.mocked(policyComplianceRepository.findDraftForSubmission).mockResolvedValue(draft());
    vi.mocked(policyComplianceRepository.submitDraft).mockResolvedValue(draft('IN_REVIEW'));
  });

  it('submits an owned draft for Admin review', async () => {
    const result = await policyComplianceService.submitForReview(userId, policyId, versionId);
    expect(policyComplianceRepository.submitDraft).toHaveBeenCalledWith(
      policyId,
      versionId,
      userId,
    );
    expect(result).toMatchObject({
      policyId,
      policyCode: 'TEST',
      version: { id: versionId, status: 'IN_REVIEW' },
    });
  });

  it('rejects users who are not Security Officers', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'ADMIN',
    });
    await expect(
      policyComplianceService.submitForReview(userId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(policyComplianceRepository.findDraftForSubmission).not.toHaveBeenCalled();
  });

  it('rejects drafts owned and authored by another user', async () => {
    const otherUserId = '38ee9371-a84b-4409-b5a8-8e7bb16d5081';
    vi.mocked(policyComplianceRepository.findDraftForSubmission).mockResolvedValue({
      ...draft(),
      author_user_id: otherUserId,
      policies_policy_versions_policy_idTopolicies: {
        ...draft().policies_policy_versions_policy_idTopolicies,
        owner_user_id: otherUserId,
      },
    });
    await expect(
      policyComplianceService.submitForReview(userId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a version that is no longer a draft', async () => {
    vi.mocked(policyComplianceRepository.findDraftForSubmission).mockResolvedValue(
      draft('IN_REVIEW'),
    );
    await expect(
      policyComplianceService.submitForReview(userId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_DRAFT_NOT_SUBMITTABLE' });
  });

  it('rejects a concurrent status change', async () => {
    vi.mocked(policyComplianceRepository.submitDraft).mockResolvedValue(null);
    await expect(
      policyComplianceService.submitForReview(userId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_DRAFT_CHANGED' });
  });
});
