import { requestContextStorage } from '../src/common/middleware/request-context.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma, policy_decision_action, policy_version_status } from '@prisma/client';

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  policy_versions: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  policy_decisions: { create: vi.fn() }, policies: { update: vi.fn() },
  audit_logs: { findFirst: vi.fn(), create: vi.fn<(input: { data: Prisma.audit_logsUncheckedCreateInput }) => Promise<unknown>>() },
}));
const transaction = vi.hoisted(() => vi.fn());
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: transaction } }));
import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';

const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const actorId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const decisionId = '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81';
const at = new Date('2026-11-07T02:00:00Z');
type Scenario = { action: policy_decision_action; before: policy_version_status; after: policy_version_status; reason: string | null; run: () => Promise<unknown> };
const scenarios: Scenario[] = [
  { action: 'REVIEWED', before: 'IN_REVIEW', after: 'WAITING_APPROVAL', reason: null,
    run: () => policyComplianceRepository.reviewDraft(policyId, versionId, actorId) },
  { action: 'APPROVED', before: 'WAITING_APPROVAL', after: 'APPROVED', reason: null,
    run: () => policyComplianceRepository.approveDraftForPublication(policyId, versionId, actorId) },
  ...(['IN_REVIEW', 'WAITING_APPROVAL', 'APPROVED'] as const).flatMap((before): Scenario[] => [
    { action: 'REJECTED', before, after: 'REJECTED', reason: 'Publication requirements are incomplete.',
      run: () => policyComplianceRepository.rejectDraft(policyId, versionId, actorId, { reason: 'Publication requirements are incomplete.' }) },
    { action: 'REVISION_REQUESTED', before, after: 'DRAFT', reason: 'Clarify incident reporting responsibilities.',
      run: () => policyComplianceRepository.requestDraftRevision(policyId, versionId, actorId, { comment: 'Clarify incident reporting responsibilities.' }) },
  ]),
];

describe.each(scenarios)('$action from $before policy audit', (scenario) => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.audit_logs.findFirst.mockResolvedValue({ record_hash: 'previous-policy-hash' });
    transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
    db.policy_versions.findFirst.mockResolvedValue({ status: scenario.before, version_number: '2.0' });
    db.policy_versions.updateMany.mockResolvedValue({ count: 1 });
    db.policy_decisions.create.mockResolvedValue({ id: decisionId, action: scenario.action, actor_user_id: actorId, comment: scenario.reason, decided_at: at });
    db.policy_versions.findUniqueOrThrow.mockResolvedValue({ id: versionId, policy_id: policyId, version_number: '2.0', status: scenario.after });
  });

  it('saves one audit with the real prior status, actor, decision time and reason in the decision transaction', async () => {
    await requestContextStorage.run({ sourceIp: '192.0.2.10', userAgent: 'audit-test', correlationId: 'policy-request' }, scenario.run);
    expect(transaction).toHaveBeenCalledOnce();
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.policy_versions.findFirst.mock.invocationCallOrder[0] ?? 0);
    expect(db.policy_versions.findFirst.mock.invocationCallOrder[0]).toBeLessThan(db.policy_versions.updateMany.mock.invocationCallOrder[0] ?? 0);
    expect(db.audit_logs.create).toHaveBeenCalledOnce();
    const call = db.audit_logs.create.mock.calls[0];
    if (!call) throw new Error('Expected an audit insert');
    const data = call[0].data;
    expect(data).toMatchObject({
      actor_type: 'USER', actor_user_id: actorId, action: `POLICY_${scenario.action}`,
      resource_type: 'POLICY_VERSION', resource_id: versionId, source: 'API', occurred_at: at,
      before_data: { policyId, versionId, versionNumber: '2.0', status: scenario.before },
      after_data: { policyId, versionId, versionNumber: '2.0', status: scenario.after, decisionId, reason: scenario.reason },
    });
    expect(data.record_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.previous_hash).toBe('previous-policy-hash');
    expect(data.source_ip).toBe('192.0.2.10');
    expect(data.user_agent).toBe('audit-test');
    expect(data.correlation_id).toBe('policy-request');
    expect(data.after_data).not.toHaveProperty('content');
  });

  it('rejects the transaction callback when audit insertion fails, allowing Prisma to roll back the decision', async () => {
    const failure = new Error('Audit write failed');
    db.audit_logs.create.mockRejectedValue(failure);
    await expect(scenario.run()).rejects.toBe(failure);
    expect(db.policy_decisions.create).toHaveBeenCalledOnce();
    expect(db.policies.update).toHaveBeenCalledOnce();
  });

  it('does not record a decision or audit for a failed conditional transition', async () => {
    db.policy_versions.updateMany.mockResolvedValue({ count: 0 });
    await expect(scenario.run()).resolves.toBeNull();
    expect(db.policy_decisions.create).not.toHaveBeenCalled();
    expect(db.audit_logs.create).not.toHaveBeenCalled();
  });

  it('does not write when the policy/version pair no longer exists', async () => {
    db.policy_versions.findFirst.mockResolvedValue(null);
    await expect(scenario.run()).resolves.toBeNull();
    expect(db.policy_versions.updateMany).not.toHaveBeenCalled();
    expect(db.audit_logs.create).not.toHaveBeenCalled();
  });
});
