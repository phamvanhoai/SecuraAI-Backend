import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    findPolicyVersionForPublication: vi.fn(),
    publishApprovedVersion: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const authorId = '38ee9371-a84b-4409-b5a8-8e7bb16d5081';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const timestamp = new Date('2026-09-26T00:00:00Z');

function version(status: 'APPROVED' | 'PUBLISHED') {
  return {
    id: versionId,
    policy_id: policyId,
    version_number: '1.0',
    content: 'Required controls',
    change_summary: null,
    status,
    author_user_id: authorId,
    created_at: timestamp,
    published_at: status === 'PUBLISHED' ? timestamp : null,
    policies_policy_versions_policy_idTopolicies: {
      policy_code: 'ISP-001',
      title: 'Security policy',
      description: null,
      owner_user_id: authorId,
      status: status === 'PUBLISHED' ? ('ACTIVE' as const) : ('DRAFT' as const),
      updated_at: timestamp,
    },
  };
}

describe('publish policy version service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.findPolicyVersionForPublication).mockResolvedValue(
      version('APPROVED'),
    );
    vi.mocked(policyComplianceRepository.publishApprovedVersion).mockResolvedValue(
      version('PUBLISHED'),
    );
  });

  it('publishes an approved version as the active official policy', async () => {
    await expect(
      policyComplianceService.publishPolicyVersion(adminId, policyId, versionId),
    ).resolves.toMatchObject({
      policyId,
      policyStatus: 'active',
      version: { status: 'published', effectiveDate: timestamp },
    });
    expect(policyComplianceRepository.publishApprovedVersion).toHaveBeenCalledWith(
      policyId,
      versionId,
    );
  });

  it('rejects a non-Admin actor before reading the version', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    await expect(
      policyComplianceService.publishPolicyVersion(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(policyComplianceRepository.findPolicyVersionForPublication).not.toHaveBeenCalled();
  });

  it('requires an approved policy version', async () => {
    vi.mocked(policyComplianceRepository.findPolicyVersionForPublication).mockResolvedValue(null);
    await expect(
      policyComplianceService.publishPolicyVersion(adminId, policyId, versionId),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'APPROVED_POLICY_VERSION_NOT_FOUND',
    });
  });

  it('rejects a concurrent publication change', async () => {
    vi.mocked(policyComplianceRepository.publishApprovedVersion).mockResolvedValue(null);
    await expect(
      policyComplianceService.publishPolicyVersion(adminId, policyId, versionId),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_VERSION_CHANGED' });
  });
});
