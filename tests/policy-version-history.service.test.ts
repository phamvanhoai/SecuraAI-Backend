import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    listPolicyVersionHistory: vi.fn(),
    findPolicyVersionHistory: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const publishedAt = new Date('2026-09-30T00:00:00Z');
const record = {
  id: versionId,
  policy_id: policyId,
  version_number: '1.0',
  content: 'Official policy content',
  change_summary: 'Initial publication',
  status: 'SUPERSEDED' as const,
  created_at: new Date('2026-09-20T00:00:00Z'),
  published_at: publishedAt,
  users: { id: userId, full_name: 'Security Officer' },
  policies_policy_versions_policy_idTopolicies: {
    policy_code: 'ISP-001',
    title: 'Information Security Policy',
    description: 'Corporate security requirements',
  },
};

describe('policy version history service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  });

  it('lists only publication history with normalized archived status', async () => {
    vi.mocked(policyComplianceRepository.listPolicyVersionHistory).mockResolvedValue([1, [record]]);
    const result = await policyComplianceService.listPolicyVersionHistory(userId, {
      page: 1,
      limit: 20,
      status: 'all',
    });
    expect(result).toMatchObject({
      canViewDrafts: false,
      items: [
        {
          policyCode: 'ISP-001',
          status: 'archived',
          effectiveDate: publishedAt,
          createdBy: { name: 'Security Officer' },
          publishedBy: null,
        },
      ],
      pagination: { total: 1, totalPages: 1 },
    });
  });

  it('returns one published version with content', async () => {
    vi.mocked(policyComplianceRepository.findPolicyVersionHistory).mockResolvedValue(record);
    const result = await policyComplianceService.getPolicyVersionHistory(
      userId,
      policyId,
      versionId,
    );
    expect(result).toMatchObject({
      policyId,
      version: { id: versionId, content: 'Official policy content', status: 'archived' },
    });
  });

  it('rejects Employees', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    await expect(
      policyComplianceService.listPolicyVersionHistory(userId, {
        page: 1,
        limit: 20,
        status: 'all',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});
