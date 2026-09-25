import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    listReviewableDrafts: vi.fn(),
    findReviewableDraft: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const createdAt = new Date('2026-09-25T00:00:00Z');

describe('view submitted policy draft service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  });

  it('lists submitted drafts with pagination', async () => {
    vi.mocked(policyComplianceRepository.listReviewableDrafts).mockResolvedValue([
      1,
      [
        {
          id: policyId,
          policy_code: 'ISP-001',
          title: 'Security policy',
          description: null,
          owner_user_id: adminId,
          status: 'DRAFT',
          updated_at: createdAt,
          policy_versions_policy_versions_policy_idTopolicies: [
            {
              id: versionId,
              version_number: '1.0',
              status: 'IN_REVIEW',
              author_user_id: adminId,
              created_at: createdAt,
            },
          ],
        },
      ],
    ]);
    const result = await policyComplianceService.listReviewableDrafts(adminId, {
      page: 1,
      limit: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(result.items[0]).toMatchObject({
      policyCode: 'ISP-001',
      draftVersion: { status: 'in_review' },
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('returns the submitted version content and details', async () => {
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue({
      id: versionId,
      policy_id: policyId,
      version_number: '1.0',
      content: 'Required controls',
      change_summary: 'Initial submission',
      status: 'IN_REVIEW',
      author_user_id: adminId,
      created_at: createdAt,
      policies_policy_versions_policy_idTopolicies: {
        policy_code: 'ISP-001',
        title: 'Security policy',
        description: null,
        owner_user_id: adminId,
        status: 'DRAFT',
        updated_at: createdAt,
      },
    });
    const result = await policyComplianceService.getReviewableDraft(adminId, policyId, versionId);
    expect(result).toMatchObject({
      policyId,
      policyCode: 'ISP-001',
      version: { id: versionId, content: 'Required controls', status: 'in_review' },
    });
  });

  it('rejects non-Admin actors before querying drafts', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    await expect(
      policyComplianceService.getReviewableDraft(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(policyComplianceRepository.findReviewableDraft).not.toHaveBeenCalled();
  });

  it('hides drafts that are not submitted for review', async () => {
    vi.mocked(policyComplianceRepository.findReviewableDraft).mockResolvedValue(null);
    await expect(
      policyComplianceService.getReviewableDraft(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 404, code: 'POLICY_DRAFT_NOT_FOUND' });
  });
});
