import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ updateTreatmentActionProgress: vi.fn() }));

vi.mock('../src/modules/risk-management/risk-management.repository.js', () => ({
  riskManagementRepository: mocks,
}));

import { riskManagementService } from '../src/modules/risk-management/risk-management.service.js';

const planId = '11111111-1111-4111-8111-111111111111';
const actionId = '22222222-2222-4222-8222-222222222222';
const input = {
  expectedUpdatedAt: new Date('2026-09-21T02:00:00.000Z'),
  progressPercent: 50,
  progressNote: 'Implementation is halfway complete.',
};
const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  permissions: ['risk-treatment-actions.update-progress'],
  roles: ['SECURITY_OFFICER'],
};
const context = { ipAddress: null, userAgent: null };

describe('update treatment action progress service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the update permission', async () => {
    await expect(
      riskManagementService.updateTreatmentActionProgress(
        planId,
        actionId,
        input,
        { ...actor, permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mocks.updateTreatmentActionProgress).not.toHaveBeenCalled();
  });

  it('returns server-derived action and aggregate progress', async () => {
    const result = {
      actionId,
      treatmentPlanId: planId,
      progressPercent: 50,
      status: 'in_progress',
      completedAt: null,
      updatedAt: new Date('2026-09-21T02:05:00.000Z'),
      planStatus: 'in_progress',
      riskStatus: 'in_treatment',
      progressPercentAverage: 50,
      totalActions: 2,
      completedActions: 0,
      allActionsCompleted: false,
    };
    mocks.updateTreatmentActionProgress.mockResolvedValueOnce({ failure: null, result });
    await expect(
      riskManagementService.updateTreatmentActionProgress(planId, actionId, input, actor, context),
    ).resolves.toEqual(result);
    expect(mocks.updateTreatmentActionProgress).toHaveBeenCalledWith(
      planId,
      actionId,
      input,
      expect.objectContaining({ actorUserId: actor.userId, actorIsAdmin: false }),
    );
  });

  it.each([
    ['ACTION_NOT_FOUND', 404, 'TREATMENT_ACTION_NOT_FOUND'],
    ['FORBIDDEN', 403, 'FORBIDDEN'],
    ['ACTION_CHANGED', 409, 'TREATMENT_ACTION_CHANGED'],
    ['ACTION_CANCELLED', 409, 'TREATMENT_ACTION_CANCELLED'],
    ['PLAN_NOT_TRACKABLE', 409, 'TREATMENT_PLAN_NOT_TRACKABLE'],
    ['RISK_NOT_IN_TREATMENT', 409, 'RISK_NOT_IN_TREATMENT'],
    ['REGRESSION_NOTE_REQUIRED', 422, 'PROGRESS_NOTE_REQUIRED'],
  ] as const)('maps %s to an actionable error', async (failure, statusCode, code) => {
    mocks.updateTreatmentActionProgress.mockResolvedValueOnce({ failure, result: null });
    await expect(
      riskManagementService.updateTreatmentActionProgress(planId, actionId, input, actor, context),
    ).rejects.toMatchObject({ statusCode, code });
  });
});
