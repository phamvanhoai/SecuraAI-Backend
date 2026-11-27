import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestContextStorage } from '../src/common/middleware/request-context.js';
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(), users: { findUnique: vi.fn() }, policies: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  policy_versions: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  policy_acknowledgements: { findUnique: vi.fn(), create: vi.fn() },
  audit_logs: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) } }));
import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const at = new Date('2026-11-26T00:00:00Z');
const run = () => policyComplianceRepository.createPolicyAcknowledgement(policyId, versionId, userId);
describe('version-specific policy acknowledgement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    tx.policies.findUnique.mockResolvedValue({ status: 'ACTIVE', current_published_version_id: versionId });
    tx.policy_versions.findFirst.mockResolvedValue({ version_number: '2.0' });
    tx.policy_acknowledgements.findUnique.mockResolvedValue(null);
    tx.policy_acknowledgements.create.mockResolvedValue({ acknowledged_at: at });
    tx.audit_logs.findFirst.mockResolvedValue({ record_hash: 'previous-hash' });
  });
  it('creates a separate acknowledgement and audit for v2 with request metadata', async () => {
    await expect(requestContextStorage.run({ sourceIp: '192.0.2.2' }, run)).resolves.toEqual({ acknowledged_at: at, alreadyAcknowledged: false });
    expect(tx.$queryRaw.mock.calls[0]?.[0].join('')).toContain('FROM policies');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.policies.findUnique.mock.invocationCallOrder[0] ?? 0);
    expect(tx.policy_acknowledgements.create).toHaveBeenCalledWith({ data: { policy_version_id: versionId, user_id: userId }, select: { acknowledged_at: true } });
    expect(tx.audit_logs.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'POLICY_READING_ACKNOWLEDGED', actor_user_id: userId, resource_id: versionId, source_ip: '192.0.2.2', previous_hash: 'previous-hash', occurred_at: at, after_data: { policyId, versionId, versionNumber: '2.0', acknowledgedAt: at.toISOString() } }) });
  });
  it('returns the original confirmation time on repeat without a second audit', async () => {
    tx.policy_acknowledgements.findUnique.mockResolvedValue({ acknowledged_at: at });
    await expect(run()).resolves.toEqual({ acknowledged_at: at, alreadyAcknowledged: true });
    expect(tx.policy_acknowledgements.create).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('refuses a stale v1 confirmation after v2 became current', async () => {
    tx.policies.findUnique.mockResolvedValue({ status: 'ACTIVE', current_published_version_id: 'different-version' });
    await expect(run()).rejects.toMatchObject({ statusCode: 409, code: 'POLICY_VERSION_CHANGED' });
    expect(tx.policy_acknowledgements.create).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('refuses a version that is no longer published', async () => {
    tx.policy_versions.findFirst.mockResolvedValue(null);
    await expect(run()).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each(['ADMIN', 'SECURITY_OFFICER', 'EXECUTIVE'])('rechecks and rejects %s inside the transaction', async (role) => {
    tx.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
    await expect(run()).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.policy_acknowledgements.create).not.toHaveBeenCalled();
  });
  it('rejects inactive accounts', async () => {
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'INACTIVE' });
    await expect(run()).rejects.toMatchObject({ statusCode: 401 });
  });
  it('propagates audit failure to abort the acknowledgement transaction', async () => {
    const error = new Error('Audit failure');
    tx.audit_logs.create.mockRejectedValue(error);
    await expect(run()).rejects.toBe(error);
  });
  it('publication takes the same policy lock before changing the current version and retains acknowledgements', async () => {
    const nextId = '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81';
    tx.policies.findFirst.mockResolvedValue({ current_published_version_id: versionId });
    tx.policy_versions.updateMany.mockResolvedValue({ count: 1 });
    tx.policy_versions.findUniqueOrThrow.mockResolvedValue({ id: nextId });
    await policyComplianceRepository.publishApprovedVersion(policyId, nextId);
    expect(tx.$queryRaw.mock.calls[0]?.[0].join('')).toContain('FROM policies');
    expect(tx.$queryRaw.mock.calls[0]?.[1]).toBe(policyId);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.policy_versions.updateMany.mock.invocationCallOrder[0] ?? 0);
    expect(tx.policy_versions.updateMany).toHaveBeenCalledWith({ where: { id: versionId, policy_id: policyId, status: 'PUBLISHED' }, data: { status: 'SUPERSEDED' } });
    expect(tx.policies.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ current_published_version_id: nextId }) }));
    expect(tx.policy_acknowledgements.create).not.toHaveBeenCalled();
  });
});
