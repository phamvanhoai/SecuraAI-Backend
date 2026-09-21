import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(), $queryRaw: vi.fn(),
  users: { findFirst: vi.fn() },
  risk_treatment_actions: { findFirst: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
  risk_treatment_plans: { findUnique: vi.fn(), update: vi.fn() },
  risk_assessments: { updateMany: vi.fn() },
  audit_logs: { create: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) },
}));
import { riskManagementRepository } from '../src/modules/risk-management/risk-management.repository.js';

const stamp = new Date('2026-09-21T12:00:00.000Z');
const actorId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const actionId = '33333333-3333-4333-8333-333333333333';
const context = { actorUserId: actorId, actorIsAdmin: false, ipAddress: null, userAgent: null };
const action = () => ({
  risk_treatment_action_id: actionId, risk_treatment_plan_id: planId,
  title: 'Enable MFA', progress_percent: 0, status: 'pending', completed_at: null,
  updated_at: stamp, assigned_to_user_id: actorId,
  risk_treatment_plans: {
    risk_treatment_plan_id: planId, owner_user_id: actorId,
    risk_assessment_id: '44444444-4444-4444-8444-444444444444', status: 'approved',
    risk_assessments: { status: 'approved' },
  },
});
const update = (progressPercent = 50, progressNote?: string) =>
  riskManagementRepository.updateTreatmentActionProgress(planId, actionId, {
    expectedUpdatedAt: stamp, progressPercent, ...(progressNote ? { progressNote } : {}),
  }, context);

describe('treatment action progress transaction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.users.findFirst.mockResolvedValue({ user_id: actorId });
    tx.risk_treatment_plans.findUnique.mockResolvedValue({ risk_assessment_id: action().risk_treatment_plans.risk_assessment_id });
    tx.risk_treatment_actions.findFirst.mockResolvedValue(action());
    tx.risk_treatment_actions.updateMany.mockResolvedValue({ count: 1 });
    tx.risk_treatment_actions.aggregate.mockResolvedValue({ _avg: { progress_percent: 50 }, _count: { _all: 2 } });
    tx.risk_treatment_actions.count.mockResolvedValue(1);
  });

  it.each([0, 50, 100])('derives state from %i percent and audits in the transaction', async (percent) => {
    const result = await update(percent);
    expect(result.failure).toBeNull();
    const status = percent === 0 ? 'pending' : percent === 100 ? 'completed' : 'in_progress';
    expect(tx.risk_treatment_actions.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ progress_percent: percent, status,
        completed_at: percent === 100 ? expect.any(Date) : null }),
    }));
    expect(tx.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      actor_user_id: actorId, entity_id: actionId,
      after_data: expect.objectContaining({ treatmentPlanId: planId, progressPercent: percent }),
    }) }));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.risk_assessments.updateMany).toHaveBeenCalledTimes(percent > 0 ? 1 : 0);
  });

  it.each(['draft', 'rejected', 'pending_approval', 'completed', 'cancelled'])('blocks plan state %s', async (status) => {
    const record = action(); record.risk_treatment_plans.status = status;
    tx.risk_treatment_actions.findFirst.mockResolvedValue(record);
    expect((await update()).failure).toBe('PLAN_NOT_TRACKABLE');
    expect(tx.risk_treatment_actions.updateMany).not.toHaveBeenCalled();
  });

  it.each(['draft', 'pending_approval', 'rejected', 'closed', 'cancelled'])('blocks risk state %s', async (status) => {
    const record = action(); record.risk_treatment_plans.risk_assessments.status = status;
    tx.risk_treatment_actions.findFirst.mockResolvedValue(record);
    expect((await update()).failure).toBe('RISK_NOT_IN_TREATMENT');
    expect(tx.risk_treatment_actions.updateMany).not.toHaveBeenCalled();
  });

  it('blocks stale action versions before any write', async () => {
    tx.risk_treatment_actions.findFirst.mockResolvedValue({ ...action(), updated_at: new Date(stamp.getTime() + 1) });
    expect((await update()).failure).toBe('ACTION_CHANGED');
    expect(tx.risk_treatment_actions.updateMany).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });

  it('requires an active actor and assignment or ownership', async () => {
    tx.users.findFirst.mockResolvedValueOnce(null);
    expect((await update()).failure).toBe('ACTOR_INACTIVE');
    const record = action(); record.assigned_to_user_id = 'other'; record.risk_treatment_plans.owner_user_id = 'other';
    tx.risk_treatment_actions.findFirst.mockResolvedValue(record);
    expect((await update()).failure).toBe('FORBIDDEN');
    expect(tx.risk_treatment_actions.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an action outside this plan and a cancelled action', async () => {
    tx.risk_treatment_actions.findFirst.mockResolvedValueOnce(null);
    expect((await update()).failure).toBe('ACTION_NOT_FOUND');
    expect(tx.risk_treatment_actions.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { risk_treatment_action_id: actionId, risk_treatment_plan_id: planId },
    }));
    tx.risk_treatment_actions.findFirst.mockResolvedValueOnce({ ...action(), status: 'cancelled' });
    expect((await update()).failure).toBe('ACTION_CANCELLED');
  });

  it('requires a reason to reduce progress and clears the completion timestamp on reopening', async () => {
    tx.risk_treatment_actions.findFirst.mockResolvedValue({ ...action(), progress_percent: 100, status: 'completed', completed_at: stamp });
    expect((await update(60)).failure).toBe('REGRESSION_NOTE_REQUIRED');
    expect((await update(60, 'Verification found additional work.')).failure).toBeNull();
    expect(tx.risk_treatment_actions.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ progress_percent: 60, status: 'in_progress', completed_at: null }),
    }));
  });

  it('excludes cancelled actions and never closes risk or completes the plan automatically', async () => {
    tx.risk_treatment_actions.aggregate.mockResolvedValue({ _avg: { progress_percent: 100 }, _count: { _all: 2 } });
    tx.risk_treatment_actions.count.mockResolvedValue(2);
    const result = await update(100);
    expect(result.result).toMatchObject({ allActionsCompleted: true, planStatus: 'in_progress', riskStatus: 'in_treatment' });
    expect(tx.risk_treatment_actions.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { risk_treatment_plan_id: planId, status: { not: 'cancelled' } },
    }));
  });

  it('does not report success if audit persistence fails', async () => {
    tx.audit_logs.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(update()).rejects.toThrow('audit unavailable');
  });
});
