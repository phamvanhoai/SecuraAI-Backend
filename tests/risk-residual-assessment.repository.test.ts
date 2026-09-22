import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  users: { findFirst: vi.fn() },
  risk_assessments: { findUnique: vi.fn(), updateMany: vi.fn() },
  risk_treatment_plans: { update: vi.fn() },
  audit_logs: { create: vi.fn() },
  notifications: { createMany: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  },
}));

import { riskManagementRepository } from '../src/modules/risk-management/risk-management.repository.js';

const stamp = new Date('2026-09-22T08:00:00.000Z');
const riskAssessmentId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const input = {
  residualLikelihood: 2,
  residualImpact: 3,
  assessmentNote: 'Controls were tested and reduced exposure.',
  expectedUpdatedAt: stamp,
};
const context = { actorUserId: actorId, actorIsAdmin: false, ipAddress: null, userAgent: null };
const risk = () => ({
  risk_assessment_id: riskAssessmentId,
  risk_code: 'RSK-001',
  title: 'Privileged account compromise',
  likelihood: 4,
  impact: 5,
  risk_score: 20,
  residual_likelihood: null,
  residual_impact: null,
  residual_score: null,
  status: 'in_treatment',
  updated_at: stamp,
  assessed_by_user_id: actorId,
  risk_treatment_plans: [
    {
      risk_treatment_plan_id: planId,
      strategy: 'mitigate',
      status: 'in_progress',
      completed_at: null,
      owner_user_id: actorId,
      risk_treatment_actions: [{ status: 'completed', progress_percent: 100 }],
    },
  ],
});

describe('residual risk assessment transaction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.users.findFirst.mockResolvedValue({ user_id: actorId });
    tx.risk_assessments.findUnique.mockResolvedValue(risk());
    tx.risk_assessments.updateMany.mockResolvedValue({ count: 1 });
  });

  it('calculates score and level, preserves inherent risk, and audits atomically', async () => {
    const result = await riskManagementRepository.performResidualRiskAssessment(
      riskAssessmentId,
      input,
      context,
    );
    expect(result.result).toMatchObject({
      status: 'in_treatment',
      inherentRisk: { likelihood: 4, impact: 5, score: 20 },
      residualRisk: { likelihood: 2, impact: 3, score: 6, level: 'medium', reduction: 14 },
    });
    expect(tx.risk_assessments.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          residual_likelihood: 2,
          residual_impact: 3,
          residual_score: 6,
        }),
      }),
    );
    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'risk-assessment.residual-assessed',
          after_data: expect.objectContaining({ assessmentNote: input.assessmentNote }),
        }),
      }),
    );
    expect(tx.risk_treatment_plans.update).toHaveBeenCalledWith({
      where: { risk_treatment_plan_id: planId },
      data: { status: 'completed', completed_at: expect.any(Date), updated_at: expect.any(Date) },
    });
  });

  it('requires every active non-accept action to be completed at 100%', async () => {
    const record = risk();
    record.risk_treatment_plans[0]!.risk_treatment_actions = [
      { status: 'in_progress', progress_percent: 90 },
    ];
    tx.risk_assessments.findUnique.mockResolvedValue(record);
    const result = await riskManagementRepository.performResidualRiskAssessment(
      riskAssessmentId,
      input,
      context,
    );
    expect(result.failure).toBe('ACTIONS_INCOMPLETE');
    expect(tx.risk_assessments.updateMany).not.toHaveBeenCalled();
  });

  it('allows an approved accept plan without treatment actions', async () => {
    const record = risk();
    record.status = 'approved';
    record.risk_treatment_plans[0]!.strategy = 'accept';
    record.risk_treatment_plans[0]!.status = 'approved';
    record.risk_treatment_plans[0]!.risk_treatment_actions = [];
    tx.risk_assessments.findUnique.mockResolvedValue(record);
    await expect(
      riskManagementRepository.performResidualRiskAssessment(
        riskAssessmentId,
        { ...input, residualLikelihood: 4, residualImpact: 5 },
        context,
      ),
    ).resolves.toMatchObject({ failure: null });
  });

  it('does not let an accept plan bypass declared actions or claim reduction without actions', async () => {
    const withIncompleteAction = risk();
    withIncompleteAction.risk_treatment_plans[0]!.strategy = 'accept';
    withIncompleteAction.risk_treatment_plans[0]!.risk_treatment_actions = [
      { status: 'in_progress', progress_percent: 80 },
    ];
    tx.risk_assessments.findUnique.mockResolvedValueOnce(withIncompleteAction);
    expect(
      (
        await riskManagementRepository.performResidualRiskAssessment(
          riskAssessmentId,
          input,
          context,
        )
      ).failure,
    ).toBe('ACTIONS_INCOMPLETE');

    const withoutActions = risk();
    withoutActions.risk_treatment_plans[0]!.strategy = 'accept';
    withoutActions.risk_treatment_plans[0]!.risk_treatment_actions = [];
    tx.risk_assessments.findUnique.mockResolvedValueOnce(withoutActions);
    expect(
      (
        await riskManagementRepository.performResidualRiskAssessment(
          riskAssessmentId,
          input,
          context,
        )
      ).failure,
    ).toBe('ACCEPT_WITHOUT_ACTIONS_MUST_MATCH_INHERENT');
  });

  it('notifies the assessor and plan owner without notifying the actor twice', async () => {
    const record = risk();
    record.assessed_by_user_id = '44444444-4444-4444-8444-444444444444';
    record.risk_treatment_plans[0]!.owner_user_id = '55555555-5555-4555-8555-555555555555';
    tx.risk_assessments.findUnique.mockResolvedValue(record);
    await riskManagementRepository.performResidualRiskAssessment(riskAssessmentId, input, {
      ...context,
      actorIsAdmin: true,
    });
    expect(tx.notifications.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ user_id: record.assessed_by_user_id }),
        expect.objectContaining({ user_id: record.risk_treatment_plans[0]!.owner_user_id }),
      ]),
    });
  });

  it('rejects stale writes and residual risk above inherent risk', async () => {
    const stale = risk();
    stale.updated_at = new Date(stamp.getTime() + 1);
    tx.risk_assessments.findUnique.mockResolvedValueOnce(stale);
    expect(
      (
        await riskManagementRepository.performResidualRiskAssessment(
          riskAssessmentId,
          input,
          context,
        )
      ).failure,
    ).toBe('RISK_CHANGED');

    const lowInherent = risk();
    lowInherent.risk_score = 4;
    tx.risk_assessments.findUnique.mockResolvedValueOnce(lowInherent);
    expect(
      (
        await riskManagementRepository.performResidualRiskAssessment(
          riskAssessmentId,
          input,
          context,
        )
      ).failure,
    ).toBe('RESIDUAL_EXCEEDS_INHERENT');
  });

  it('rolls back the operation when audit persistence fails', async () => {
    tx.audit_logs.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(
      riskManagementRepository.performResidualRiskAssessment(riskAssessmentId, input, context),
    ).rejects.toThrow('audit unavailable');
  });
});
