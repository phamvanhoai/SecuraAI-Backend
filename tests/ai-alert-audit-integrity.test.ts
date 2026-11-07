import { describe, expect, it } from 'vitest';
import { hashAuditRecord } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';

const auditRecord = {
  previousHash: 'a'.repeat(64),
  actorUserId: '9a9bf33a-02db-48e4-a8ad-90517278d7f2',
  action: 'START_AI_ALERT_TRIAGE',
  resourceType: 'ANOMALY_ALERT',
  resourceId: 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8',
  source: 'API',
  afterData: { status: 'IN_TRIAGE', assignedTo: 'analyst' },
  occurredAt: new Date('2026-11-07T07:00:00.000Z'),
};

describe('AI alert audit integrity hash', () => {
  it('produces a deterministic SHA-256 digest', () => {
    const first = hashAuditRecord(auditRecord);
    const second = hashAuditRecord(auditRecord);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it('changes when either the chain link or audited data changes', () => {
    const original = hashAuditRecord(auditRecord);

    expect(hashAuditRecord({ ...auditRecord, previousHash: 'b'.repeat(64) })).not.toBe(original);
    expect(
      hashAuditRecord({
        ...auditRecord,
        afterData: { status: 'NEED_INVESTIGATION', assignedTo: 'analyst' },
      }),
    ).not.toBe(original);
  });
});
