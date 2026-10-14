import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
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
    status,
    updated_at: updatedAt,
    risks: {
      id: riskId,
      owner_user_id: actorId,
      risk_code: 'RSK-ABCCADFC',
      status: riskStatus,
    },
    risk_treatment_actions: [
      { id: actionId, status: 'PENDING' },
    ],
    risk_treatment_plan_controls: [{ control_id: controlId }],
  };
}

function input(status: 'active' | 'cancelled') {
  return {
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
  beforeEach(() => {
    vi.clearAllMocks();
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
