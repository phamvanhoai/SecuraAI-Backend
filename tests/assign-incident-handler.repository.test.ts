import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignIncidentHandlerSchema } from '../src/modules/information-security-incident-management/dto/assign-incident-handler.dto.js';

const mocks = vi.hoisted(() => ({
  users: { findUnique: vi.fn(), findMany: vi.fn() },
  incidents: { findUnique: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
  audit_logs: { create: vi.fn(), findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    users: mocks.users,
    incidents: mocks.incidents,
    audit_logs: mocks.audit_logs,
    $transaction: (callback: (tx: typeof mocks) => Promise<unknown>) => callback(mocks),
  },
}));
import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';

const actorId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const incidentId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const input = { assigneeUserId: actorId, note: 'Officer will investigate production access.' };
const at = new Date('2026-10-09T00:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.incidents.findUnique.mockResolvedValue({
    status: 'TRIAGE',
    handler_user_id: null,
    updated_at: at,
  });
  mocks.incidents.findUniqueOrThrow.mockResolvedValue({ id: incidentId });
});
describe('UC58 assignment', () => {
  it('loads the latest assignment time for detail without mistaking unrelated handler audits', async () => {
    mocks.incidents.findUnique.mockResolvedValue({ id: incidentId, handler_user_id: actorId });
    mocks.audit_logs.findMany.mockResolvedValue([
      { resource_id: incidentId, occurred_at: at, after_data: { assigneeUserId: actorId } },
    ]);
    expect(await incidentsRepository.findById(incidentId)).toMatchObject({ assignment_at: at });
    mocks.audit_logs.findMany.mockResolvedValue([
      { resource_id: incidentId, occurred_at: at, after_data: { assigneeUserId: incidentId } },
    ]);
    expect(await incidentsRepository.findById(incidentId)).toMatchObject({ assignment_at: null });
  });
  it('validates UUID, bounded note, timestamp and rejects unknown fields', () => {
    expect(assignIncidentHandlerSchema.parse({ ...input, note: `  ${input.note}  ` }).note).toBe(
      input.note,
    );
    for (const invalid of [
      { ...input, assigneeUserId: 'bad' },
      { ...input, note: 'short' },
      { ...input, note: 'x'.repeat(2001) },
      { ...input, expectedUpdatedAt: 'bad' },
      { ...input, status: 'CLOSED' },
    ]) {
      expect(assignIncidentHandlerSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it('updates handler and audit atomically without changing phase', async () => {
    expect(await incidentsRepository.assignHandler(actorId, incidentId, input)).toMatchObject({
      outcome: 'assigned',
      changed: true,
    });
    expect(mocks.$queryRaw).toHaveBeenCalled();
    expect(mocks.incidents.update).toHaveBeenCalledWith({
      where: { id: incidentId },
      data: { handler_user_id: actorId, updated_at: expect.any(Date) },
    });
    expect(mocks.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_user_id: actorId,
        resource_id: incidentId,
        action: 'INCIDENT_HANDLER_ASSIGNED',
        before_data: { assigneeUserId: null },
        after_data: input,
        record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });
  it('records previous handler on reassignment', async () => {
    mocks.incidents.findUnique.mockResolvedValue({
      status: 'RECOVERY',
      handler_user_id: incidentId,
      updated_at: at,
    });
    await incidentsRepository.assignHandler(actorId, incidentId, input);
    expect(mocks.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ before_data: { assigneeUserId: incidentId } }),
    });
  });
  it('same-handler retry performs no writes', async () => {
    mocks.incidents.findUnique.mockResolvedValue({
      status: 'TRIAGE',
      handler_user_id: actorId,
      updated_at: at,
    });
    expect(await incidentsRepository.assignHandler(actorId, incidentId, input)).toMatchObject({
      changed: false,
    });
    expect(mocks.incidents.update).not.toHaveBeenCalled();
    expect(mocks.audit_logs.create).not.toHaveBeenCalled();
  });
  it('rejects missing, closed, stale incidents without writes', async () => {
    mocks.incidents.findUnique.mockResolvedValue(null);
    expect(await incidentsRepository.assignHandler(actorId, incidentId, input)).toEqual({
      outcome: 'not_found',
    });
    mocks.incidents.findUnique.mockResolvedValue({ status: 'CLOSED', updated_at: at });
    expect(await incidentsRepository.assignHandler(actorId, incidentId, input)).toEqual({
      outcome: 'closed',
    });
    mocks.incidents.findUnique.mockResolvedValue({ status: 'OPEN', updated_at: at });
    expect(
      await incidentsRepository.assignHandler(actorId, incidentId, {
        ...input,
        expectedUpdatedAt: '2026-10-08T00:00:00Z',
      }),
    ).toEqual({ outcome: 'conflict' });
    expect(mocks.incidents.update).not.toHaveBeenCalled();
  });
  it('rechecks assigning officer and handler eligibility inside transaction', async () => {
    mocks.users.findUnique.mockResolvedValue({ role: 'EXECUTIVE', status: 'ACTIVE' });
    expect(await incidentsRepository.assignHandler(actorId, incidentId, input)).toEqual({
      outcome: 'forbidden',
    });
    mocks.users.findUnique
      .mockResolvedValueOnce({ role: 'SECURITY_OFFICER', status: 'ACTIVE' })
      .mockResolvedValueOnce({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    expect(await incidentsRepository.assignHandler(actorId, incidentId, input)).toEqual({
      outcome: 'invalid_handler',
    });
    expect(mocks.incidents.update).not.toHaveBeenCalled();
  });
  it('audit failure propagates and prevents transaction completion', async () => {
    mocks.audit_logs.create.mockRejectedValue(new Error('Audit unavailable'));
    await expect(incidentsRepository.assignHandler(actorId, incidentId, input)).rejects.toThrow(
      'Audit unavailable',
    );
    expect(mocks.incidents.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('options restrict records to active Security Officers', async () => {
    await incidentsRepository.assignmentOptions();
    expect(mocks.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'SECURITY_OFFICER', status: 'ACTIVE' } }),
    );
  });
});
