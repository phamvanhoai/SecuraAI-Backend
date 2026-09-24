import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transactionClient: {},
  findPolicyByCode: vi.fn(),
  createPolicyDraft: vi.fn(),
  createPolicyDraftAudit: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock('../src/modules/policy-compliance/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findPolicyByCode: mocks.findPolicyByCode,
    createPolicyDraft: mocks.createPolicyDraft,
    createPolicyDraftAudit: mocks.createPolicyDraftAudit,
  },
}));

import { policyComplianceService } from '../src/modules/policy-compliance/policy-compliance.service.js';

const createdAt = new Date('2026-09-06T10:00:00.000Z');
const policyRecord = {
  policy_id: '00000000-0000-4000-8000-000000000010',
  policy_code: 'ISP-001',
  title: 'Information Security Policy',
  description: null,
  owner_user_id: '00000000-0000-4000-8000-000000000001',
  status: 'draft',
  created_at: createdAt,
  updated_at: createdAt,
  policy_versions: [
    {
      policy_version_id: '00000000-0000-4000-8000-000000000011',
      version_number: '1.0',
      content: 'Policy content',
      status: 'draft',
      created_at: createdAt,
    },
  ],
};

describe('policyComplianceService.createPolicyDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPolicyByCode.mockResolvedValue(null);
    mocks.createPolicyDraft.mockResolvedValue(policyRecord);
    mocks.createPolicyDraftAudit.mockResolvedValue({ audit_log_id: 'audit-id' });
    mocks.transaction.mockImplementation(
      async (operation: (transaction: object) => Promise<unknown>) =>
        operation(mocks.transactionClient),
    );
  });

  it('creates the draft and audit record in the same transaction', async () => {
    const result = await policyComplianceService.createPolicyDraft(
      {
        policyCode: 'ISP-001',
        title: 'Information Security Policy',
        versionNumber: '1.0',
        content: 'Policy content',
      },
      {
        userId: '00000000-0000-4000-8000-000000000001',
        permissions: ['policies.create'],
      },
      { ipAddress: null, userAgent: null },
    );

    expect(mocks.createPolicyDraft).toHaveBeenCalledWith(mocks.transactionClient, {
      policyCode: 'ISP-001',
      title: 'Information Security Policy',
      versionNumber: '1.0',
      content: 'Policy content',
      actorUserId: '00000000-0000-4000-8000-000000000001',
    });
    expect(mocks.createPolicyDraftAudit).toHaveBeenCalledWith(mocks.transactionClient, {
      actorUserId: '00000000-0000-4000-8000-000000000001',
      policyId: policyRecord.policy_id,
      policyCode: policyRecord.policy_code,
      title: policyRecord.title,
      versionNumber: '1.0',
      ipAddress: null,
      userAgent: null,
    });
    expect(result.currentVersion.versionNumber).toBe('1.0');
  });

  it('rejects an existing policy code before opening a transaction', async () => {
    mocks.findPolicyByCode.mockResolvedValue({ policy_id: policyRecord.policy_id });

    await expect(
      policyComplianceService.createPolicyDraft(
        {
          policyCode: 'ISP-001',
          title: 'Information Security Policy',
          versionNumber: '1.0',
          content: 'Policy content',
        },
        {
          userId: '00000000-0000-4000-8000-000000000001',
          permissions: ['policies.create'],
        },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'POLICY_CODE_EXISTS',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
