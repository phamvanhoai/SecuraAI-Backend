import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(), risk_acceptances: { count: vi.fn() }, audit_logs: { findFirst: vi.fn(), create: vi.fn() },
  risks: { update: vi.fn() },
  control_risk_links: { count: vi.fn() },
  risk_treatment_plan_controls: { deleteMany: vi.fn(), createMany: vi.fn() },
  users: { findUnique: vi.fn(), count: vi.fn() },
  risk_treatment_actions: {
    deleteMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  risk_treatment_plans: {
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (operation: (database: typeof db) => Promise<unknown>) => operation(db),
  },
}));

import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const riskId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const actionId = '44444444-4444-4444-8444-444444444444';
const controlId = '55555555-5555-4555-8555-555555555555';
const updatedAt = new Date('2026-10-12T08:00:00.000Z');

function plan(status: 'DRAFT' | 'ACTIVE', riskStatus: 'OPEN' | 'UNDER_TREATMENT') {
  return {
    id: planId,
    strategy: "MITIGATE",
    status,
    updated_at: updatedAt,
    risk_id: riskId,
    created_at: new Date('2026-10-01'),
    risks: {
      id: riskId,
      owner_user_id: actorId,
      risk_code: 'RSK-ABCCADFC',
      status: riskStatus,
    },
    risk_treatment_actions: [
      { id: actionId, status: 'PENDING', created_at: new Date('2026-10-01') },
    ],
    risk_treatment_plan_controls: [{ control_id: controlId }],
  };
}

function input(status: 'active' | 'cancelled') {
  return {
    changeReason: "Documented change for the treatment plan.",
    title: 'Improve database recovery',
    strategy: 'mitigate' as const,
    ownerUserId: actorId,
    targetDate: '2026-10-30',
    status,
    expectedUpdatedAt: updatedAt.toISOString(),
    controlIds: [controlId],
    actions: [{
      id: actionId,
      title: 'Test database restoration',
      assignedToUserId: actorId,
      dueDate: '2026-10-28',
      status: 'pending' as const,
    }],
  };
}

describe('treatment plan and Risk status synchronization', () => {
  it.each(['avoid', 'transfer', 'accept'] as const)('blocks changing Active strategy to %s before any writes', async (strategy) => {
    db.risk_treatment_plans.findUnique.mockResolvedValue(plan('ACTIVE', 'UNDER_TREATMENT'));
    await expect(riskRegisterRepository.updateTreatmentPlan(planId, actorId, { ...input('active'), strategy })).resolves.toEqual({ kind: 'active_strategy_locked' });
    expect(db.risk_treatment_plans.update).not.toHaveBeenCalled();
    expect(db.risk_treatment_actions.update).not.toHaveBeenCalled();
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('requires a reason for Active edits even if called without DTO validation', async () => {
    db.risk_treatment_plans.findUnique.mockResolvedValue(plan('ACTIVE', 'UNDER_TREATMENT'));
    const { changeReason, ...request } = input('active');
    expect(changeReason).toBeTruthy();
    await expect(riskRegisterRepository.updateTreatmentPlan(planId, actorId, request)).resolves.toEqual({ kind: 'change_reason_required' });
    expect(db.risk_treatment_plans.update).not.toHaveBeenCalled();
  });
  it('permits a strategy change while Draft', async () => {
    db.risk_treatment_plans.findUnique.mockResolvedValue(plan('DRAFT', 'OPEN'));
    db.risks.update.mockResolvedValue({ status: 'UNDER_TREATMENT' });
    await expect(riskRegisterRepository.updateTreatmentPlan(planId, actorId, { ...input('active'), strategy: 'transfer' })).resolves.toMatchObject({ kind: 'updated' });
    expect(db.risk_treatment_plans.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ strategy: 'TRANSFER' }) }));
  });
  it('keeps completed and in-progress actions intact when cancelling, and audits the reason', async () => {
    const completedAt = new Date('2026-10-10');
    db.risk_treatment_plans.findUnique.mockResolvedValue({ ...plan('ACTIVE', 'UNDER_TREATMENT'),
      risk_treatment_actions: [{ id: actionId, status: 'COMPLETED', completed_at: completedAt }, { id: 'in-progress', status: 'IN_PROGRESS', completed_at: null }],
    });
    db.risk_treatment_plans.count.mockResolvedValue(0);
    db.risks.update.mockResolvedValue({ status: 'OPEN' });
    await expect(riskRegisterRepository.updateTreatmentPlan(planId, actorId, input('cancelled'))).resolves.toMatchObject({ kind: 'updated' });
    expect(db.risk_treatment_actions.deleteMany).not.toHaveBeenCalled();
    expect(db.risk_treatment_actions.update).not.toHaveBeenCalled();
    expect(db.risk_treatment_plan_controls.deleteMany).not.toHaveBeenCalled();
    expect(db.risk_treatment_plans.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED', updated_at: new Date('2026-11-09T00:00:00Z') } }));
    expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ after_data: expect.objectContaining({ changeReason: input('cancelled').changeReason, preservedActions: expect.arrayContaining([{ id: actionId, status: 'COMPLETED', completedAt: completedAt.toISOString() }]) }) }) }));
  });
  it('allows adding actions to an Active plan with its original strategy and a reason', async () => {
    db.risk_treatment_plans.findUnique.mockResolvedValue(plan('ACTIVE', 'UNDER_TREATMENT'));
    const request = input('active');
    const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await expect(riskRegisterRepository.updateTreatmentPlan(planId, actorId, { ...request, targetDate: due, actions: [...request.actions, { title: 'Additional verification', assignedToUserId: actorId, dueDate: due, status: 'pending' }] })).resolves.toMatchObject({ kind: 'updated' });
    expect(db.risk_treatment_actions.create).toHaveBeenCalled();
    expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ after_data: expect.objectContaining({ changeReason: request.changeReason }) }) }));
  });
  it('blocks pending acceptance before writing actions', async () => {
    db.risk_treatment_plans.findUnique.mockResolvedValue(plan('ACTIVE', 'UNDER_TREATMENT'));
    db.risk_acceptances.count.mockResolvedValue(1);
    await expect(riskRegisterRepository.updateTreatmentPlan(planId, actorId, input('active'))).resolves.toEqual({ kind: 'pending_acceptance' });
    expect(db.risk_treatment_actions.update).not.toHaveBeenCalled();
  });
  it('rejects stale snapshots after locking the Risk and plan', async () => {
    db.risk_treatment_plans.findUnique.mockResolvedValue(plan('ACTIVE', 'UNDER_TREATMENT'));
    await expect(riskRegisterRepository.updateTreatmentPlan(planId, actorId, { ...input('active'), expectedUpdatedAt: new Date('2026-01-01').toISOString() })).resolves.toEqual({ kind: 'conflict' });
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(db.risk_treatment_actions.update).not.toHaveBeenCalled();
  });
  it('retains completion timestamp on later plan edits', async () => {
    const completedAt = new Date('2026-10-10');
    const saved = plan('ACTIVE', 'UNDER_TREATMENT');
    db.risk_treatment_plans.findUnique.mockResolvedValue({ ...saved, risk_treatment_actions: [{ ...saved.risk_treatment_actions[0], action_description: 'Test database restoration', owner_user_id: actorId, due_date: new Date('2026-10-28'), status: 'COMPLETED', completed_at: completedAt }] });
    const request = input('active');
    await riskRegisterRepository.updateTreatmentPlan(planId, actorId, { ...request, actions: request.actions.map((item) => ({ ...item, status: 'completed' as const })) });
    expect(db.risk_treatment_actions.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completed_at: completedAt }) }));
    expect(db.audit_logs.create).toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue([{ time: new Date("2026-11-09T00:00:00Z") }]);
    db.risk_acceptances.count.mockResolvedValue(0);
    db.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER' });
    db.users.count.mockResolvedValue(1);
    db.risk_treatment_actions.deleteMany.mockResolvedValue({ count: 0 });
    db.risk_treatment_actions.update.mockResolvedValue({});
    db.control_risk_links.count.mockResolvedValue(1);
    db.risk_treatment_plan_controls.deleteMany.mockResolvedValue({ count: 0 });
    db.risk_treatment_plan_controls.createMany.mockResolvedValue({ count: 0 });
    db.risk_treatment_plans.update.mockImplementation(async ({ data }: { data: { status: string } }) => ({
      id: planId,
      title: 'Improve database recovery',
      strategy: 'MITIGATE',
      status: data.status,
      owner_user_id: actorId,
      target_completion_date: new Date('2026-10-30T00:00:00.000Z'),
      updated_at: new Date('2026-10-12T09:00:00.000Z'),
      risk_treatment_actions: [],
      risk_treatment_plan_controls: [{ security_controls: { id: controlId, control_code: 'CTRL-001', name: 'Control' } }],
    }));
  });

  it('moves an Open Risk to Under treatment when its draft plan is activated', async () => {
    db.risk_treatment_plans.findUnique.mockResolvedValue(plan('DRAFT', 'OPEN'));
    db.risks.update.mockResolvedValue({ status: 'UNDER_TREATMENT' });

    const result = await riskRegisterRepository.updateTreatmentPlan(
      planId,
      actorId,
      input('active'),
    );

    expect(db.risks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: riskId },
      data: expect.objectContaining({ status: 'UNDER_TREATMENT' }),
    }));
    expect(result).toMatchObject({ kind: 'updated', riskStatus: 'UNDER_TREATMENT' });
  });

  it('reopens an Under-treatment Risk when its active plan is cancelled and no other active plan exists', async () => {
    db.risk_treatment_plans.findUnique.mockResolvedValue(plan('ACTIVE', 'UNDER_TREATMENT'));
    db.risk_treatment_plans.count.mockResolvedValue(0);
    db.risks.update.mockResolvedValue({ status: 'OPEN' });

    const result = await riskRegisterRepository.updateTreatmentPlan(
      planId,
      actorId,
      input('cancelled'),
    );

    expect(db.risks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: riskId },
      data: expect.objectContaining({ status: 'OPEN' }),
    }));
    expect(result).toMatchObject({ kind: 'updated', riskStatus: 'OPEN' });
  });
});
