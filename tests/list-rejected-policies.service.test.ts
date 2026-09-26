import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    listRejectedPolicies: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';

describe('list rejected policies service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId, role: 'ADMIN', status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.listRejectedPolicies).mockResolvedValue([
      1,
      [
        {
          id: '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81',
          comment: 'Missing mandatory controls.',
          decided_at: new Date('2026-09-26T00:00:00Z'),
          actor_user_id: adminId,
          users: { full_name: 'System Administrator' },
          policy_versions: {
            id: 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8',
            policy_id: 'cc641a6e-6c63-4cf0-b626-34307fb36a88',
            version_number: '1.0',
            status: 'REJECTED',
            policies_policy_versions_policy_idTopolicies: {
              policy_code: 'ISP-001', title: 'Security policy', owner_user_id: null,
            },
          },
        },
      ],
    ]);
  });

  it('returns the rejection reason and reviewer identity', async () => {
    const result = await policyComplianceService.listRejectedPolicies(adminId, {
      page: 1, limit: 20, sortOrder: 'desc',
    });
    expect(result).toMatchObject({
      items: [{
        policyCode: 'ISP-001',
        version: { status: 'rejected' },
        rejection: {
          reason: 'Missing mandatory controls.',
          rejectedByName: 'System Administrator',
        },
      }],
      pagination: { total: 1, totalPages: 1 },
    });
  });

  it('scopes Security Officers to policies they own', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: adminId, role: 'SECURITY_OFFICER', status: 'ACTIVE',
    });
    const query = { page: 1, limit: 20, sortOrder: 'desc' as const };
    await policyComplianceService.listRejectedPolicies(adminId, query);
    expect(policyComplianceRepository.listRejectedPolicies).toHaveBeenCalledWith(query, adminId);
  });
});
