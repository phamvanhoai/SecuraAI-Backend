import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
  users: { findUnique: vi.fn() },
  incidents: { findUnique: vi.fn(), update: vi.fn() },
  incident_analysis: { upsert: vi.fn() },
  audit_logs: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ...tx,
    $transaction: (input: ((transaction: typeof tx) => Promise<unknown>) | Promise<unknown>[]) =>
      typeof input === 'function' ? input(tx) : Promise.all(input),
  },
}));
import { incidentAnalysisRepository } from '../src/modules/information-security-incident-management/incident-analysis.repository.js';
const input = {
  rootCause: 'Verified authentication control gap.',
  lessonsLearned: 'Review all privileged access exceptions.',
  improvementActions: 'Remove obsolete access and enforce MFA.',
  expectedUpdatedAt: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  tx.incidents.findUnique.mockResolvedValue({ status: 'LESSONS_LEARNED', incident_analysis: null });
  tx.incident_analysis.upsert.mockResolvedValue({ id: 'analysis' });
});
it.each(['LESSONS_LEARNED', 'CLOSED'])(
  'upserts one analysis and atomic audit in %s without changing status',
  async (status) => {
    tx.incidents.findUnique.mockResolvedValue({ status, incident_analysis: null });
    expect(await incidentAnalysisRepository.save('officer', 'incident', input)).toMatchObject({
      outcome: 'saved',
    });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.incident_analysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { incident_id: 'incident' },
        create: expect.objectContaining({
          incident_id: 'incident',
          analyzed_by: 'officer',
          root_cause: input.rootCause,
        }),
      }),
    );
    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'INCIDENT_ANALYSIS_SAVED',
          actor_user_id: 'officer',
          after_data: {
            rootCause: input.rootCause,
            lessonsLearned: input.lessonsLearned,
            improvementActions: input.improvementActions,
          },
        }),
      }),
    );
    expect(tx.incidents.update).toHaveBeenCalledWith({
      where: { id: 'incident' },
      data: { updated_at: expect.any(Date) },
    });
  },
);
it('preserves previous findings in audit and updates existing row', async () => {
  const previous = {
    updated_at: new Date('2026-01-01'),
    root_cause: 'old cause',
    lessons_learned: 'old lessons',
    improvement_actions: 'old improvements',
  };
  tx.incidents.findUnique.mockResolvedValue({ status: 'CLOSED', incident_analysis: previous });
  await incidentAnalysisRepository.save('officer', 'incident', {
    ...input,
    expectedUpdatedAt: previous.updated_at.toISOString(),
  });
  expect(tx.audit_logs.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        before_data: {
          rootCause: 'old cause',
          lessonsLearned: 'old lessons',
          improvementActions: 'old improvements',
        },
      }),
    }),
  );
});
it.each(['OPEN', 'TRIAGE', 'CONTAINMENT', 'ERADICATION', 'RECOVERY'])(
  'rejects %s before writing',
  async (status) => {
    tx.incidents.findUnique.mockResolvedValue({ status, incident_analysis: null });
    expect(await incidentAnalysisRepository.save('officer', 'incident', input)).toEqual({
      outcome: 'not_ready',
    });
    expect(tx.incident_analysis.upsert).not.toHaveBeenCalled();
  },
);
it('rejects stale updates and races creating the first record', async () => {
  tx.incidents.findUnique.mockResolvedValue({
    status: 'CLOSED',
    incident_analysis: { updated_at: new Date('2026-01-01') },
  });
  expect(await incidentAnalysisRepository.save('officer', 'incident', input)).toEqual({
    outcome: 'conflict',
  });
  expect(
    await incidentAnalysisRepository.save('officer', 'incident', {
      ...input,
      expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
    }),
  ).toEqual({ outcome: 'conflict' });
  expect(tx.incident_analysis.upsert).not.toHaveBeenCalled();
});
it('rechecks active role and missing incident within transaction', async () => {
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
  expect(await incidentAnalysisRepository.save('officer', 'incident', input)).toEqual({
    outcome: 'forbidden',
  });
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  tx.incidents.findUnique.mockResolvedValue(null);
  expect(await incidentAnalysisRepository.save('officer', 'incident', input)).toEqual({
    outcome: 'not_found',
  });
  expect(tx.incident_analysis.upsert).not.toHaveBeenCalled();
});
it('propagates audit failure for rollback', async () => {
  tx.audit_logs.create.mockRejectedValue(new Error('audit failed'));
  await expect(incidentAnalysisRepository.save('officer', 'incident', input)).rejects.toThrow(
    'audit failed',
  );
});
it('filters and bounds audit history with stable order', async () => {
  await incidentAnalysisRepository.history('incident', 2, 10);
  expect(tx.audit_logs.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        resource_type: 'INCIDENT',
        resource_id: 'incident',
        action: 'INCIDENT_ANALYSIS_SAVED',
        outcome: 'SUCCESS',
      },
      skip: 10,
      take: 10,
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    }),
  );
});
