import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
  users: { findUnique: vi.fn() },
  incidents: { findUnique: vi.fn(), update: vi.fn() },
  audit_logs: { create: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ...tx,
    $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  },
}));
import {
  incidentClosureRepository,
  closureRestriction,
} from '../src/modules/information-security-incident-management/incident-closure.repository.js';
import { closeIncidentSchema } from '../src/modules/information-security-incident-management/dto/close-incident.dto.js';
const input = closeIncidentSchema.parse({
  summary: 'Recovery validated and required findings recorded.',
  confirmed: true,
  expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
});
const incident = {
  status: 'LESSONS_LEARNED',
  updated_at: new Date(input.expectedUpdatedAt),
  closed_at: null,
  incident_analysis: {
    root_cause: 'Known cause',
    lessons_learned: 'Review performed',
    improvement_actions: 'Prevention recommended',
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  tx.incidents.findUnique.mockResolvedValue(incident);
});
it('locks and atomically updates closure with actor, summary and before/after audit', async () => {
  expect(await incidentClosureRepository.close('officer', 'incident', input)).toMatchObject({
    changed: true,
    closedAt: expect.any(Date),
  });
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.incidents.update).toHaveBeenCalledWith({
    where: { id: 'incident' },
    data: { status: 'CLOSED', closed_at: expect.any(Date), updated_at: expect.any(Date) },
  });
  expect(tx.audit_logs.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        actor_user_id: 'officer',
        action: 'INCIDENT_CLOSED',
        before_data: { status: 'LESSONS_LEARNED', closedAt: null },
        after_data: expect.objectContaining({
          summary: input.summary,
          confirmed: true,
          status: 'CLOSED',
        }),
      }),
    }),
  );
});
it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE'])('rejects %s writes', async (role) => {
  tx.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
  await expect(incidentClosureRepository.close('officer', 'incident', input)).rejects.toMatchObject(
    { statusCode: 403 },
  );
  expect(tx.incidents.update).not.toHaveBeenCalled();
});
it('rejects disabled officers', async () => {
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
  await expect(incidentClosureRepository.close('officer', 'incident', input)).rejects.toMatchObject(
    { statusCode: 403 },
  );
});
it('rejects missing and stale incidents without writing', async () => {
  tx.incidents.findUnique.mockResolvedValue(null);
  await expect(incidentClosureRepository.close('officer', 'incident', input)).rejects.toMatchObject(
    { statusCode: 404 },
  );
  tx.incidents.findUnique.mockResolvedValue(incident);
  await expect(
    incidentClosureRepository.close('officer', 'incident', {
      ...input,
      expectedUpdatedAt: '2025-01-01T00:00:00Z',
    }),
  ).rejects.toMatchObject({ code: 'INCIDENT_STALE' });
  expect(tx.incidents.update).not.toHaveBeenCalled();
});
it.each(['OPEN', 'TRIAGE', 'CONTAINMENT', 'ERADICATION', 'RECOVERY'])(
  'rejects premature closure from %s',
  async (status) => {
    tx.incidents.findUnique.mockResolvedValue({ ...incident, status });
    await expect(
      incidentClosureRepository.close('officer', 'incident', input),
    ).rejects.toMatchObject({ code: 'INCIDENT_NOT_READY_TO_CLOSE' });
    expect(tx.incidents.update).not.toHaveBeenCalled();
  },
);
it('requires necessary findings, not an action count', () => {
  expect(closureRestriction({ ...incident, incident_analysis: null })).toMatch(/Save root cause/);
  expect(
    closureRestriction({
      ...incident,
      incident_analysis: { ...incident.incident_analysis, lessons_learned: '  ' },
    }),
  ).toMatch(/Save root cause/);
  expect(closureRestriction(incident)).toBeNull();
});
it('preserves closure timestamp and audit on replay', async () => {
  const closed = new Date('2026-01-02T00:00:00Z');
  tx.incidents.findUnique.mockResolvedValue({ ...incident, status: 'CLOSED', closed_at: closed });
  expect(await incidentClosureRepository.close('officer', 'incident', input)).toEqual({
    changed: false,
    closedAt: closed,
  });
  expect(tx.incidents.update).not.toHaveBeenCalled();
  expect(tx.audit_logs.create).not.toHaveBeenCalled();
});
it('propagates audit failure so the transaction cannot commit', async () => {
  tx.audit_logs.create.mockRejectedValue(new Error('Audit unavailable'));
  await expect(incidentClosureRepository.close('officer', 'incident', input)).rejects.toThrow(
    'Audit unavailable',
  );
});
it.each([
  { ...input, confirmed: false },
  { ...input, summary: 'short' },
  { ...input, closedAt: input.expectedUpdatedAt },
  { ...input, expectedUpdatedAt: undefined },
])('rejects invalid DTO', (body) => {
  expect(closeIncidentSchema.safeParse(body).success).toBe(false);
});
