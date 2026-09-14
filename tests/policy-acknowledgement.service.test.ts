import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  list: vi.fn(),
}));
vi.mock('../src/modules/policy-compliance/policy-acknowledgement.repository.js', () => ({
  policyAcknowledgementRepository: mocks,
}));
import { policyAcknowledgementService as service } from '../src/modules/policy-compliance/policy-acknowledgement.service.js';
const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['policies.acknowledge'],
};
const policyId = '00000000-0000-4000-8000-000000000002',
  versionId = '00000000-0000-4000-8000-000000000003';
describe('policy acknowledgement service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (fn: (db: object) => Promise<unknown>) => fn({}));
    mocks.find.mockResolvedValue({
      policy_version_id: versionId,
      version_number: '1.0',
      content: 'Policy',
      change_summary: null,
      effective_date: null,
      published_at: new Date(),
      policies: { policy_id: policyId, policy_code: 'ISP-001', title: 'Policy', description: null },
      policy_acknowledgements: [],
    });
    mocks.create.mockResolvedValue({ acknowledged_at: new Date('2026-09-14T00:00:00.000Z') });
  });
  it('requires policies.acknowledge', async () => {
    await expect(
      service.acknowledge(
        policyId,
        versionId,
        { ...actor, permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('records acknowledgement and audit', async () => {
    await expect(
      service.acknowledge(policyId, versionId, actor, {
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      }),
    ).resolves.toMatchObject({ alreadyAcknowledged: false });
    expect(mocks.create).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalled();
  });
  it('does not duplicate acknowledgement', async () => {
    mocks.find.mockResolvedValue({
      ...(await mocks.find()),
      policy_acknowledgements: [{ acknowledged_at: new Date() }],
    });
    await expect(
      service.acknowledge(policyId, versionId, actor, { ipAddress: null, userAgent: null }),
    ).resolves.toMatchObject({ alreadyAcknowledged: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
