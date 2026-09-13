import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findPolicyForNewVersion: vi.fn(),
  createNewPolicyVersion: vi.fn(),
  createNewPolicyVersionAudit: vi.fn(),
}));

vi.mock('../src/modules/policy-compliance/policy-compliance.repository.js', () => ({
  policyComplianceRepository: mocks,
}));

import { policyComplianceService } from '../src/modules/policy-compliance/policy-compliance.service.js';

const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['policies.update'],
};
const policyId = '00000000-0000-4000-8000-000000000010';
const versionId = '00000000-0000-4000-8000-000000000011';
const input = {
  versionNumber: '1.1',
  content: 'Updated policy content',
  changeSummary: 'Updated access controls',
};
const policy = {
  policy_id: policyId,
  policy_code: 'ISP-001',
  title: 'Information Security Policy',
  description: null,
  owner_user_id: actor.userId,
  status: 'published',
  policy_versions: [
    {
      policy_version_id: 'published-id',
      version_number: '1.0',
      status: 'published',
    },
  ],
};
const created = {
  policy_version_id: versionId,
  policy_id: policyId,
  version_number: '1.1',
  content: input.content,
  change_summary: input.changeSummary,
  status: 'draft',
  created_by_user_id: actor.userId,
  created_at: new Date('2026-09-13T00:00:00.000Z'),
  policies: {
    policy_code: 'ISP-001',
    title: policy.title,
    description: null,
    owner_user_id: actor.userId,
    status: 'draft',
    updated_at: new Date('2026-09-13T00:00:00.000Z'),
  },
};

describe('policyComplianceService.updatePolicyAndCreateVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (operation: (database: object) => Promise<unknown>) => operation({}),
    );
    mocks.findPolicyForNewVersion.mockResolvedValue(policy);
    mocks.createNewPolicyVersion.mockResolvedValue(created);
    mocks.createNewPolicyVersionAudit.mockResolvedValue({ audit_log_id: 'audit-id' });
  });

  it('requires policies.update in the service layer', async () => {
    await expect(
      policyComplianceService.updatePolicyAndCreateVersion(
        policyId,
        input,
        { ...actor, permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('updates policy metadata and creates an audited draft version', async () => {
    const result = await policyComplianceService.updatePolicyAndCreateVersion(
      policyId,
      { ...input, title: 'Updated Information Security Policy' },
      actor,
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(result).toMatchObject({
      policyId,
      policyStatus: 'draft',
      version: { id: versionId },
    });
    expect(mocks.createNewPolicyVersion).toHaveBeenCalled();
    expect(mocks.createNewPolicyVersionAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        previousVersionNumber: '1.0',
        versionNumber: '1.1',
        changedPolicyFields: ['title'],
      }),
    );
  });

  it('does not let another security officer update the policy', async () => {
    mocks.findPolicyForNewVersion.mockResolvedValue({
      ...policy,
      owner_user_id: 'another-user',
    });

    await expect(
      policyComplianceService.updatePolicyAndCreateVersion(policyId, input, actor, {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'POLICY_NOT_FOUND' });
  });

  it('rejects a second draft version', async () => {
    mocks.findPolicyForNewVersion.mockResolvedValue({
      ...policy,
      status: 'draft',
      policy_versions: [
        ...policy.policy_versions,
        {
          policy_version_id: 'draft-id',
          version_number: '1.1',
          status: 'draft',
        },
      ],
    });

    await expect(
      policyComplianceService.updatePolicyAndCreateVersion(policyId, input, actor, {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'POLICY_DRAFT_VERSION_EXISTS',
    });
    expect(mocks.createNewPolicyVersion).not.toHaveBeenCalled();
  });

  it('requires an existing published version', async () => {
    mocks.findPolicyForNewVersion.mockResolvedValue({
      ...policy,
      status: 'draft',
      policy_versions: [],
    });

    await expect(
      policyComplianceService.updatePolicyAndCreateVersion(policyId, input, actor, {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_NOT_PUBLISHED' });
  });
});
