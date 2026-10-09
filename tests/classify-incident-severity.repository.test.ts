import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const transaction = {
    users: { findUnique: vi.fn() },
    incidents: { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    audit_logs: { create: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return { transaction };
});
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (callback: (tx: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction),
  },
}));
import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';

const actorId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const incidentId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const input = {
  severity: 'critical' as const,
  rationale: 'Production outage affects all business operations.',
};
const updatedAt = new Date('2026-10-09T00:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.users.findUnique.mockResolvedValue({
    role: 'SECURITY_OFFICER',
    status: 'ACTIVE',
  });
  mocks.transaction.incidents.findUnique.mockResolvedValue({
    severity: 'HIGH',
    status: 'TRIAGE',
    updated_at: updatedAt,
  });
  mocks.transaction.incidents.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.incidents.findUniqueOrThrow.mockResolvedValue({
    id: incidentId,
    severity: 'CRITICAL',
  });
});
describe('incident severity repository transaction', () => {
  it('locks the incident and writes severity and rationale audit in one transaction', async () => {
    expect(await incidentsRepository.classifySeverity(actorId, incidentId, input)).toMatchObject({
      outcome: 'classified',
    });
    expect(mocks.transaction.$queryRaw).toHaveBeenCalled();
    expect(mocks.transaction.incidents.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { severity: 'CRITICAL', updated_at: expect.any(Date) },
      }),
    );
    expect(mocks.transaction.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_user_id: actorId,
        resource_id: incidentId,
        action: 'INCIDENT_SEVERITY_CLASSIFIED',
        before_data: { severity: 'high', status: 'TRIAGE' },
        after_data: { ...input, status: 'TRIAGE' },
        record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });
  it('classification preserves OPEN instead of inferring triage readiness', async () => {
    mocks.transaction.incidents.findUnique.mockResolvedValue({
      status: 'OPEN',
      severity: 'HIGH',
      updated_at: updatedAt,
    });
    await incidentsRepository.classifySeverity(actorId, incidentId, input);
    expect(mocks.transaction.incidents.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { severity: 'CRITICAL', updated_at: expect.any(Date) },
      }),
    );
    expect(mocks.transaction.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before_data: { severity: 'high', status: 'OPEN' },
        after_data: { ...input, status: 'OPEN' },
      }),
    });
  });
  it('avoids writes for stale or closed incidents', async () => {
    expect(
      await incidentsRepository.classifySeverity(actorId, incidentId, {
        ...input,
        expectedUpdatedAt: '2026-10-08T00:00:00Z',
      }),
    ).toEqual({ outcome: 'conflict' });
    mocks.transaction.incidents.findUnique.mockResolvedValue({
      severity: 'HIGH',
      status: 'CLOSED',
      updated_at: updatedAt,
    });
    expect(await incidentsRepository.classifySeverity(actorId, incidentId, input)).toEqual({
      outcome: 'closed',
    });
    expect(mocks.transaction.incidents.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.audit_logs.create).not.toHaveBeenCalled();
  });
  it('checks permissions again inside the transaction', async () => {
    mocks.transaction.users.findUnique.mockResolvedValue({ role: 'EXECUTIVE', status: 'ACTIVE' });
    expect(await incidentsRepository.classifySeverity(actorId, incidentId, input)).toEqual({
      outcome: 'forbidden',
    });
    expect(mocks.transaction.incidents.updateMany).not.toHaveBeenCalled();
  });
  it('propagates audit failure so the transaction cannot commit a partial classification', async () => {
    mocks.transaction.audit_logs.create.mockRejectedValue(new Error('Audit write failed'));
    await expect(incidentsRepository.classifySeverity(actorId, incidentId, input)).rejects.toThrow(
      'Audit write failed',
    );
    expect(mocks.transaction.incidents.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
