import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
  users: { findUnique: vi.fn() },
  incidents: { findUnique: vi.fn(), update: vi.fn() },
  incident_actions: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  audit_logs: { create: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ...tx,
    $transaction: (input: ((transaction: typeof tx) => Promise<unknown>) | Promise<unknown>[]) =>
      typeof input === 'function' ? input(tx) : Promise.all(input),
  },
}));
import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';
const input = {
  description: 'Restored affected service from verified backup and confirmed normal operation.',
  performedAt: '2026-01-01T00:00:00Z',
};
beforeEach(() => {
  vi.resetAllMocks();
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  tx.incidents.findUnique.mockResolvedValue({ status: 'RECOVERY' });
  tx.incident_actions.create.mockResolvedValue({ id: 'action' });
});
it('rejects later-stage actions before any write', async () => {
  tx.incidents.findUnique.mockResolvedValue({ status: 'OPEN' });
  await expect(
    incidentsRepository.recordRecovery('officer', 'incident', input),
  ).rejects.toMatchObject({ code: 'INCIDENT_PHASE_REQUIRED', statusCode: 409 });
  expect(tx.incident_actions.create).not.toHaveBeenCalled();
  expect(tx.incidents.update).not.toHaveBeenCalled();
});
it('atomically records action and audit without changing the phase', async () => {
  expect(await incidentsRepository.recordRecovery('officer', 'incident', input)).toMatchObject({
    outcome: 'recorded',
  });
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.incident_actions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        incident_id: 'incident',
        phase: 'RECOVERY',
        description: input.description,
        performed_by: 'officer',
        performed_at: new Date(input.performedAt),
      },
    }),
  );
  expect(tx.incidents.update).toHaveBeenCalledWith({
    where: { id: 'incident' },
    data: { updated_at: expect.any(Date), status: 'RECOVERY' },
  });
  expect(tx.audit_logs.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        actor_user_id: 'officer',
        action: 'INCIDENT_RECOVERY_RECORDED',
      }),
    }),
  );
});
it('saving recovery work does not complete the phase', async () => {
  tx.incidents.findUnique.mockResolvedValue({ status: 'RECOVERY' });
  await incidentsRepository.recordRecovery('officer', 'incident', {
    ...input,
  });
  expect(tx.incidents.update).toHaveBeenCalledWith({
    where: { id: 'incident' },
    data: { updated_at: expect.any(Date), status: 'RECOVERY' },
  });
  expect(tx.audit_logs.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        before_data: { status: 'RECOVERY' },
        after_data: expect.objectContaining({ status: 'RECOVERY' }),
      }),
    }),
  );
});
it('does not regress lessons learned when appending another recovery note', async () => {
  tx.incidents.findUnique.mockResolvedValue({ status: 'LESSONS_LEARNED' });
  await incidentsRepository.recordRecovery('officer', 'incident', input);
  expect(tx.incidents.update).toHaveBeenCalledWith({
    where: { id: 'incident' },
    data: { updated_at: expect.any(Date), status: 'LESSONS_LEARNED' },
  });
});
it.each(['CLOSED', null])('rejects closed/missing incident before writing', async (status) => {
  tx.incidents.findUnique.mockResolvedValue(status ? { status } : null);
  expect(await incidentsRepository.recordRecovery('officer', 'incident', input)).toEqual({
    outcome: status ? 'closed' : 'not_found',
  });
  expect(tx.incident_actions.create).not.toHaveBeenCalled();
});
it('rechecks actor and future performed time inside transaction', async () => {
  tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
  expect(await incidentsRepository.recordRecovery('officer', 'incident', input)).toEqual({
    outcome: 'forbidden',
  });
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  expect(
    await incidentsRepository.recordRecovery('officer', 'incident', {
      ...input,
      performedAt: '2099-01-01T00:00:00Z',
    }),
  ).toEqual({ outcome: 'future_time' });
  expect(tx.incident_actions.create).not.toHaveBeenCalled();
});
it('propagates audit failure so transaction rolls back', async () => {
  tx.audit_logs.create.mockRejectedValue(new Error('Audit failure'));
  await expect(incidentsRepository.recordRecovery('officer', 'incident', input)).rejects.toThrow(
    'Audit failure',
  );
});
it('scopes and stably paginates only recovery records', async () => {
  await incidentsRepository.recoveryHistory('incident', 2, 10);
  expect(tx.incident_actions.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { incident_id: 'incident', phase: 'RECOVERY' },
      skip: 10,
      take: 10,
      orderBy: [{ performed_at: 'desc' }, { id: 'desc' }],
    }),
  );
});
