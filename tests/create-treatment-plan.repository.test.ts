import { beforeEach, describe, expect, it, vi } from 'vitest';

const assessedAt = new Date('2026-10-12T07:00:00.000Z');
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  risks: { findUnique: vi.fn() },
  users: { findUnique: vi.fn(), count: vi.fn() },
  security_controls: { findMany: vi.fn() },
  risk_assessments: { create: vi.fn(), findFirst: vi.fn() },
  control_risk_links: { createMany: vi.fn() },
  risk_treatment_plans: { create: vi.fn() },
  audit_logs: { create: vi.fn() },
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (operation: (database: typeof db) => Promise<unknown>) => operation(db),
  },
}));

import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const riskId = '22222222-2222-4222-8222-222222222222';
const controlId = '33333333-3333-4333-8333-333333333333';

describe('create treatment plan with an overdue Risk review', () => {
  const input = { riskId, title: 'Improve database recovery', strategy: 'mitigate', ownerUserId: actorId, targetDate: '2026-10-30', targetRisk: 'low', controlIds: [controlId], actions: [{ title: 'Test restoration', assignedToUserId: actorId, dueDate: '2026-10-28' }] } as const;
  const request = () => ({ ...input, controlIds: [...input.controlIds], actions: [...input.actions] });
  it.each(['ACCEPTED', 'CLOSED', 'ARCHIVED'])('blocks creation for %s', async (status) => {
    const risk = await db.risks.findUnique();
    db.risks.findUnique.mockResolvedValue({ ...risk, status });
    await expect(riskRegisterRepository.createTreatmentPlan(actorId, request())).resolves.toEqual({ kind: 'context_locked' });
    expect(db.risk_treatment_plans.create).not.toHaveBeenCalled();
  });
  it('blocks pending acceptance', async () => {
    const risk = await db.risks.findUnique();
    db.risks.findUnique.mockResolvedValue({ ...risk, risk_acceptances: [{ id: 'pending' }] });
    await expect(riskRegisterRepository.createTreatmentPlan(actorId, request())).resolves.toEqual({ kind: 'context_locked' });
  });
  it('rejects a control omitted by the eligibility query', async () => {
    const risk = await db.risks.findUnique();
    db.risks.findUnique.mockResolvedValue({ ...risk, control_risk_links: [] });
    await expect(riskRegisterRepository.createTreatmentPlan(actorId, request())).resolves.toEqual({ kind: 'invalid_controls' });
  });
  it('allows an acceptance plan without controls or actions and preserves residual history', async () => {
    const risk = await db.risks.findUnique();
    db.risks.findUnique.mockResolvedValue({ ...risk, control_risk_links: [] });
    await expect(riskRegisterRepository.createTreatmentPlan(actorId, { ...request(), strategy: 'accept', controlIds: [], actions: [] })).resolves.toMatchObject({ kind: 'created' });
    const data = db.risk_assessments.create.mock.calls[0]?.[0].data;
    expect(data.assessment_type).toBe('TARGET_DEFINITION');
    expect(data).not.toHaveProperty('residual_rating');
    expect(data).not.toHaveProperty('inherent_rating');
    expect(db.audit_logs.create).toHaveBeenCalled();
  });
  it('blocks a target exceeding residual', async () => {
    db.risk_assessments.findFirst.mockResolvedValue({ id: 'residual', residual_rating: 'LOW', assessed_at: assessedAt });
    await expect(riskRegisterRepository.createTreatmentPlan(actorId, { ...request(), targetRisk: 'high' })).resolves.toEqual({ kind: 'target_exceeds_residual' });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.risk_assessments.findFirst.mockResolvedValue(null);
    db.$queryRaw.mockResolvedValue([{ time: assessedAt }]);
    db.risks.findUnique.mockResolvedValue({
      id: riskId,
      risk_code: 'RSK-ABCCADFC',
      owner_user_id: actorId,
      status: 'OPEN', risk_acceptances: [],
      review_date: new Date('2026-10-06T00:00:00.000Z'),
      risk_assessments: [{ inherent_likelihood: 4, inherent_impact: 5, inherent_rating: 'CRITICAL' }],
      risk_treatment_plans: [],
      control_risk_links: [{ control_id: controlId }],
    });
    db.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER' });
    db.users.count.mockResolvedValue(1);
    db.security_controls.findMany.mockResolvedValue([{ id: controlId }]);
    db.risk_assessments.create.mockResolvedValue({ id: 'assessment-id' });
    db.control_risk_links.createMany.mockResolvedValue({ count: 1 });
    db.risk_treatment_plans.create.mockResolvedValue({
      id: 'plan-id',
      title: 'Improve database recovery',
      strategy: 'MITIGATE',
      status: 'DRAFT',
      target_completion_date: new Date('2026-10-30T00:00:00.000Z'),
      created_at: assessedAt,
    });
  });

  it('keeps the Risk overdue but does not copy its past date into the new assessment', async () => {
    const result = await riskRegisterRepository.createTreatmentPlan(actorId, {
      riskId,
      title: 'Improve database recovery',
      strategy: 'mitigate',
      ownerUserId: actorId,
      targetDate: '2026-10-30',
      targetRisk: 'low',
      controlIds: [controlId],
      actions: [{
        title: 'Test database restoration',
        assignedToUserId: actorId,
        dueDate: '2026-10-28',
      }],
    });

    expect(result).toMatchObject({ kind: 'created', riskCode: 'RSK-ABCCADFC' });
    expect(db.risk_assessments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assessment_type: 'TARGET_DEFINITION', assessed_at: assessedAt, review_date: null }),
      }),
    );
  });
});
