import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listOwnDrafts: vi.fn(),
  findOwnDraft: vi.fn(),
  updateOwnDraft: vi.fn(),
  createDraftUpdatedAudit: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/modules/policy-compliance/policy-compliance.repository.js', () => ({
  policyComplianceRepository: mocks,
}));

import { updatePolicyDraftSchema } from '../src/modules/policy-compliance/dto/manage-policy-draft.dto.js';
import { policyComplianceService } from '../src/modules/policy-compliance/policy-compliance.service.js';

const actor = { userId: 'user-1', permissions: ['policies.create'] };
const draft = {
  policy_version_id: 'version-1',
  policy_id: 'policy-1',
  version_number: '1.0',
  content: 'Draft content',
  change_summary: null,
  status: 'draft',
  created_by_user_id: 'user-1',
  created_at: new Date('2026-09-10T00:00:00Z'),
  policies: {
    policy_code: 'ISP-001',
    title: 'Security Policy',
    description: null,
    owner_user_id: 'user-1',
    status: 'draft',
    created_at: new Date('2026-09-10T00:00:00Z'),
    updated_at: new Date('2026-09-10T00:00:00Z'),
  },
};

describe('policy draft management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (operation: (database: object) => Promise<unknown>) => operation({}),
    );
    mocks.listOwnDrafts.mockResolvedValue({ items: [draft], total: 1 });
    mocks.findOwnDraft.mockResolvedValue(draft);
    mocks.updateOwnDraft.mockResolvedValue({ policy_id: 'policy-1' });
    mocks.createDraftUpdatedAudit.mockResolvedValue({ audit_log_id: 'audit-1' });
  });

  it('rejects empty updates', () => {
    expect(() => updatePolicyDraftSchema.parse({})).toThrow();
  });

  it('lists only drafts returned for the authenticated owner', async () => {
    const result = await policyComplianceService.listOwnDrafts(
      { page: 1, limit: 20, sortOrder: 'desc' },
      actor,
    );
    expect(mocks.listOwnDrafts).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(result.items[0]).toMatchObject({ policyId: 'policy-1', version: { id: 'version-1' } });
  });

  it('updates only an owned draft and records changed fields atomically', async () => {
    const result = await policyComplianceService.updateOwnDraft(
      'policy-1',
      'version-1',
      { content: 'Updated content' },
      actor,
      { ipAddress: null, userAgent: null },
    );
    expect(mocks.updateOwnDraft).toHaveBeenCalled();
    expect(mocks.createDraftUpdatedAudit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ changedFields: ['content'] }),
    );
    expect(result.policyId).toBe('policy-1');
  });

  it('hides drafts owned by another user as not found', async () => {
    mocks.findOwnDraft.mockResolvedValue(null);
    await expect(
      policyComplianceService.getOwnDraft('policy-1', 'version-1', actor),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'POLICY_DRAFT_NOT_FOUND',
    });
  });
});
