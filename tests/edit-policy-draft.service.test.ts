import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    findDraftForEdit: vi.fn(),
    editDraft: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';
const versionId = 'ec178d52-2959-47fd-93db-aa693158668c';
const createdAt = new Date('2026-09-25T01:00:00Z');
const updatedAt = new Date('2026-09-26T01:00:00Z');

function draft(status: 'DRAFT' | 'IN_REVIEW' = 'DRAFT', ownerUserId = userId) {
  return {
    id: versionId,
    policy_id: policyId,
    version_number: '1.0',
    content: 'Policy content',
    change_summary: null,
    status,
    author_user_id: ownerUserId,
    created_at: createdAt,
    policies_policy_versions_policy_idTopolicies: {
      policy_code: 'TEST',
      title: 'Test policy',
      description: null,
      owner_user_id: ownerUserId,
      status: 'DRAFT' as const,
      created_at: createdAt,
      updated_at: updatedAt,
    },
  };
}

describe('edit policy draft service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.findDraftForEdit).mockResolvedValue(draft());
    vi.mocked(policyComplianceRepository.editDraft).mockResolvedValue({
      ...draft(),
      version_number: '1.1',
      content: 'Updated content',
      policies_policy_versions_policy_idTopolicies: {
        ...draft().policies_policy_versions_policy_idTopolicies,
        title: 'Updated policy',
      },
    });
  });

  it('updates an owned draft and maps the response contract', async () => {
    const input = { title: 'Updated policy', versionNumber: '1.1', content: 'Updated content' };
    const result = await policyComplianceService.editOwnDraft(userId, policyId, versionId, input);
    expect(policyComplianceRepository.editDraft).toHaveBeenCalledWith(
      policyId,
      versionId,
      userId,
      input,
    );
    expect(result).toMatchObject({
      policyId,
      title: 'Updated policy',
      version: { id: versionId, versionNumber: '1.1', content: 'Updated content' },
    });
  });

  it('rejects users who are not Security Officers', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await expect(
      policyComplianceService.editOwnDraft(userId, policyId, versionId, { title: 'Updated' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(policyComplianceRepository.findDraftForEdit).not.toHaveBeenCalled();
  });

  it('rejects a draft owned by another user', async () => {
    const otherUserId = '38ee9371-a84b-4409-b5a8-8e7bb16d5081';
    vi.mocked(policyComplianceRepository.findDraftForEdit).mockResolvedValue(
      draft('DRAFT', otherUserId),
    );
    await expect(
      policyComplianceService.editOwnDraft(userId, policyId, versionId, { title: 'Updated' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a version that was already submitted', async () => {
    vi.mocked(policyComplianceRepository.findDraftForEdit).mockResolvedValue(draft('IN_REVIEW'));
    await expect(
      policyComplianceService.editOwnDraft(userId, policyId, versionId, { title: 'Updated' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_DRAFT_NOT_EDITABLE' });
  });

  it('rejects a concurrent draft-state change', async () => {
    vi.mocked(policyComplianceRepository.editDraft).mockResolvedValue(null);
    await expect(
      policyComplianceService.editOwnDraft(userId, policyId, versionId, { title: 'Updated' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_DRAFT_CHANGED' });
  });
});
