import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
  users: { findUnique: vi.fn() },
  incidents: { findUnique: vi.fn(), update: vi.fn() },
  incident_actions: { count: vi.fn() },
  audit_logs: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ...tx,
    $transaction: (input: ((value: typeof tx) => Promise<unknown>) | Promise<unknown>[]) =>
      typeof input === 'function' ? input(tx) : Promise.all(input),
  },
}));
import { incidentProgressRepository } from '../src/modules/information-security-incident-management/incident-progress.repository.js';
import { incidentProgressSchema } from '../src/modules/information-security-incident-management/dto/incident-progress.dto.js';
const input = incidentProgressSchema.parse({
  status: 'eradication',
  expectedStatus: 'containment',
  expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
  confirmed: true,
  note: 'Containment completed and its results verified.',
});
beforeEach(() => {
  vi.resetAllMocks();
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  tx.incidents.findUnique.mockResolvedValue({
    status: 'CONTAINMENT',
    updated_at: new Date(input.expectedUpdatedAt),
  });
  tx.incident_actions.count.mockResolvedValue(1);
  tx.incidents.update.mockResolvedValue({ status: 'ERADICATION' });
});
it('locks, rechecks and atomically records completion and phase change', async () => {
  await incidentProgressRepository.update('officer', 'incident', input);
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.incident_actions.count).not.toHaveBeenCalled();
  expect(tx.incidents.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { status: 'ERADICATION', updated_at: expect.any(Date) } }),
  );
  expect(tx.audit_logs.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: 'INCIDENT_PHASE_CHANGED',
        before_data: { status: 'CONTAINMENT' },
        after_data: expect.objectContaining({
          status: 'ERADICATION',
          currentPhaseCompleted: true,
          skipReason: null,
          skippedPhases: [],
        }),
      }),
    }),
  );
});
it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE'])('rejects %s transaction writes', async (role) => {
  tx.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
  await expect(
    incidentProgressRepository.update('officer', 'incident', input),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(tx.incidents.update).not.toHaveBeenCalled();
});
it('rejects stale state before changing anything', async () => {
  await expect(
    incidentProgressRepository.update('officer', 'incident', { ...input, expectedStatus: 'open' }),
  ).rejects.toMatchObject({ code: 'INCIDENT_STALE' });
  expect(tx.incidents.update).not.toHaveBeenCalled();
});
it('does not use the number of journal entries as a completion gate', async () => {
  tx.incident_actions.count.mockResolvedValue(0);
  await incidentProgressRepository.update('officer', 'incident', input);
  expect(tx.incident_actions.count).not.toHaveBeenCalled();
  expect(tx.incidents.update).toHaveBeenCalled();
});
it('audits emergency jumps without marking skipped work complete', async () => {
  await incidentProgressRepository.update('officer', 'incident', {
    ...input,
    status: 'recovery',
    skipReason: 'Urgent restoration of a critical service; eradication work deferred.',
  });
  expect(tx.incident_actions.count).not.toHaveBeenCalled();
  expect(tx.audit_logs.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        after_data: expect.objectContaining({
          status: 'RECOVERY',
          skippedPhases: ['ERADICATION'],
          currentPhaseCompleted: false,
        }),
      }),
    }),
  );
});
it('audits recovery verification as an officer attestation, not an action-count check', async () => {
  tx.incidents.findUnique.mockResolvedValue({
    status: 'RECOVERY',
    updated_at: new Date(input.expectedUpdatedAt),
  });
  tx.incident_actions.count.mockResolvedValue(0);
  await incidentProgressRepository.update('officer', 'incident', {
    ...input,
    expectedStatus: 'recovery',
    status: 'lessons_learned',
    note: 'Affected services restored; validation checks passed and monitoring is stable.',
  });
  expect(tx.incident_actions.count).not.toHaveBeenCalled();
  expect(tx.audit_logs.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        after_data: expect.objectContaining({
          recoveryVerified: true,
          currentPhaseCompleted: true,
        }),
      }),
    }),
  );
});
it('propagates audit failure for transactional rollback', async () => {
  tx.audit_logs.create.mockRejectedValue(new Error('audit unavailable'));
  await expect(incidentProgressRepository.update('officer', 'incident', input)).rejects.toThrow(
    'audit unavailable',
  );
});
it('bounds and scopes history to the selected incident and transition action', async () => {
  await incidentProgressRepository.history('incident', 2, 10);
  expect(tx.audit_logs.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        resource_type: 'INCIDENT',
        resource_id: 'incident',
        action: 'INCIDENT_PHASE_CHANGED',
        outcome: 'SUCCESS',
      },
      skip: 10,
      take: 10,
    }),
  );
});
it('requires explicit confirmation and rejects legacy/arbitrary statuses', () => {
  expect(incidentProgressSchema.safeParse({ ...input, confirmed: false }).success).toBe(false);
  expect(incidentProgressSchema.safeParse({ ...input, status: 'resolved' }).success).toBe(false);
  expect(incidentProgressSchema.safeParse({ ...input, status: 'closed' }).success).toBe(false);
  expect(incidentProgressSchema.safeParse({ ...input, expectedUpdatedAt: undefined }).success).toBe(
    false,
  );
});
