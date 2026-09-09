import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findPolicyVersion: vi.fn(),
  archivePublishedVersions: vi.fn(),
  publishDraftVersion: vi.fn(),
  markPolicyPublished: vi.fn(),
  createPublishAudit: vi.fn(),
  getPublishedVersion: vi.fn(),
}));

vi.mock('../src/modules/policy-compliance/policy-compliance.repository.js', () => ({
  policyComplianceRepository: mocks,
}));

import { policyComplianceService } from '../src/modules/policy-compliance/policy-compliance.service.js';

const policyId = '00000000-0000-4000-8000-000000000010';
const versionId = '00000000-0000-4000-8000-000000000011';
const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['policies.publish'],
};
const draft = {
  policy_version_id: versionId,
  version_number: '1.0',
  status: 'draft',
  policies: { policy_id: policyId, status: 'draft' },
};
const published = {
  policy_id: policyId,
  policy_code: 'ISP-001',
  title: 'Information Security Policy',
  status: 'published',
  policy_versions: [
    {
      policy_version_id: versionId,
      version_number: '1.0',
      status: 'published',
      effective_date: new Date('2026-09-09T00:00:00.000Z'),
      published_by_user_id: actor.userId,
      published_at: new Date('2026-09-09T10:00:00.000Z'),
      created_at: new Date('2026-09-08T10:00:00.000Z'),
    },
  ],
};

describe('policyComplianceService.publishVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (operation: (database: object) => Promise<unknown>) => operation({}),
    );
    mocks.findPolicyVersion.mockResolvedValue(draft);
    mocks.archivePublishedVersions.mockResolvedValue({ count: 0 });
    mocks.publishDraftVersion.mockResolvedValue({ count: 1 });
    mocks.markPolicyPublished.mockResolvedValue({ policy_id: policyId });
    mocks.createPublishAudit.mockResolvedValue({ audit_log_id: 'audit-id' });
    mocks.getPublishedVersion.mockResolvedValue(published);
  });

  it('requires the publish permission in the service layer', async () => {
    await expect(
      policyComplianceService.publishVersion(
        policyId,
        versionId,
        {},
        { userId: actor.userId, permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('publishes the draft and audit record in one transaction', async () => {
    const result = await policyComplianceService.publishVersion(
      policyId,
      versionId,
      { effectiveDate: '2026-09-09' },
      actor,
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(result).toMatchObject({ policyId, status: 'published' });
    expect(mocks.archivePublishedVersions).toHaveBeenCalled();
    expect(mocks.publishDraftVersion).toHaveBeenCalled();
    expect(mocks.markPolicyPublished).toHaveBeenCalled();
    expect(mocks.createPublishAudit).toHaveBeenCalled();
  });

  it('rejects a version that is already published', async () => {
    mocks.findPolicyVersion.mockResolvedValue({ ...draft, status: 'published' });
    await expect(
      policyComplianceService.publishVersion(policyId, versionId, {}, actor, {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_VERSION_ALREADY_PUBLISHED' });
    expect(mocks.publishDraftVersion).not.toHaveBeenCalled();
  });

  it('returns not found when the version does not belong to the policy', async () => {
    mocks.findPolicyVersion.mockResolvedValue(null);
    await expect(
      policyComplianceService.publishVersion(policyId, versionId, {}, actor, {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'POLICY_VERSION_NOT_FOUND' });
  });
});
