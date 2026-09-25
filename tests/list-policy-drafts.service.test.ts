import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: { findActor: vi.fn(), listOwnDrafts: vi.fn() },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';
const versionId = 'ec178d52-2959-47fd-93db-aa693158668c';
const query = { page: 1, limit: 20, sortOrder: 'desc' as const };

describe('list Security Officer policy drafts service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.listOwnDrafts).mockResolvedValue([
      1,
      [
        {
          id: versionId,
          policy_id: policyId,
          version_number: '1.0',
          content: 'Policy content',
          change_summary: 'Initial draft',
          status: 'DRAFT',
          author_user_id: userId,
          created_at: new Date('2026-09-25T01:00:00Z'),
          policies_policy_versions_policy_idTopolicies: {
            policy_code: 'TEST',
            title: 'Test policy',
            description: 'Test description',
            owner_user_id: userId,
            status: 'DRAFT',
            created_at: new Date('2026-09-25T00:00:00Z'),
            updated_at: new Date('2026-09-25T02:00:00Z'),
          },
        },
      ],
    ]);
  });

  it('returns only the actor-scoped draft page', async () => {
    const result = await policyComplianceService.listOwnDrafts(userId, query);
    expect(policyComplianceRepository.listOwnDrafts).toHaveBeenCalledWith(userId, query);
    expect(result).toMatchObject({
      items: [
        {
          policyId,
          policyCode: 'TEST',
          version: { id: versionId, status: 'DRAFT' },
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('rejects a non-Security Officer before querying drafts', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await expect(policyComplianceService.listOwnDrafts(userId, query)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(policyComplianceRepository.listOwnDrafts).not.toHaveBeenCalled();
  });

  it('rejects inactive accounts', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'LOCKED',
    });
    await expect(policyComplianceService.listOwnDrafts(userId, query)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
