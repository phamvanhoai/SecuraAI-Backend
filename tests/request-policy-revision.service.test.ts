import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    findReviewableDraft: vi.fn(),
    requestDraftRevision: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const authorId = '38ee9371-a84b-4409-b5a8-8e7bb16d5081';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const decisionId = '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81';
const createdAt = new Date('2026-09-25T00:00:00Z');

function version(status: 'IN_REVIEW' | 'DRAFT' = 'IN_REVIEW') {
  return {
    id: versionId,
    policy_id: policyId,
    version_number: '1.0',
    content: 'Required controls',
    change_summary: 'Initial submission',
    status,
    author_user_id: authorId,
    created_at: createdAt,
    policies_policy_versions_policy_idTopolicies: {
      policy_code: 'ISP-001',
      title: 'Security policy',
      description: null,
      owner_user_id: authorId,
      status: 'DRAFT' as const,
      updated_at: createdAt,
    },
  };
}

describe('request policy revision service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue(version());
    vi.mocked(policyComplianceRepository.requestDraftRevision).mockResolvedValue({
      version: version('DRAFT'),
      decision: {
        id: decisionId,
        action: 'REVISION_REQUESTED',
        actor_user_id: adminId,
        comment: 'Clarify the access scope.',
        decided_at: createdAt,
      },
    });
  });

  it('records the decision and returns the version to draft', async () => {
    const input = { comment: 'Clarify the access scope.' };
    const result = await policyComplianceService.requestRevision(
      adminId,
      policyId,
      versionId,
      input,
    );
    expect(policyComplianceRepository.requestDraftRevision).toHaveBeenCalledWith(
      policyId,
      versionId,
      adminId,
      input,
    );
    expect(result).toMatchObject({
      policyId,
      version: { id: versionId, status: 'draft' },
      decision: { id: decisionId, action: 'REVISION_REQUESTED', comment: input.comment },
    });
  });

  it('rejects a non-Admin actor', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    await expect(
      policyComplianceService.requestRevision(adminId, policyId, versionId, { comment: 'Revise' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(policyComplianceRepository.findReviewableDraft).not.toHaveBeenCalled();
  });

  it('hides policy versions that are not submitted', async () => {
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue(null);
    await expect(
      policyComplianceService.requestRevision(adminId, policyId, versionId, { comment: 'Revise' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'POLICY_DRAFT_NOT_FOUND' });
  });

  it('rejects a concurrent decision', async () => {
    vi.mocked(policyComplianceRepository.requestDraftRevision).mockResolvedValue(null);
    await expect(
      policyComplianceService.requestRevision(adminId, policyId, versionId, { comment: 'Revise' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_DRAFT_CHANGED' });
  });
});
