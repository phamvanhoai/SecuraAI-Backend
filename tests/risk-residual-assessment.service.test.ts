import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ performResidualRiskAssessment: vi.fn() }));
vi.mock('../src/modules/risk-management/risk-management.repository.js', () => ({
  riskManagementRepository: mocks,
}));

import { riskManagementService } from '../src/modules/risk-management/risk-management.service.js';

const riskAssessmentId = '11111111-1111-4111-8111-111111111111';
const input = {
  residualLikelihood: 2,
  residualImpact: 3,
  assessmentNote: 'Controls were tested and reduced exposure.',
  expectedUpdatedAt: new Date('2026-09-22T08:00:00.000Z'),
};
const actor = {
  userId: '22222222-2222-4222-8222-222222222222',
  permissions: ['risk-assessments.assess-residual'],
  roles: ['SECURITY_OFFICER'],
};
const context = { ipAddress: null, userAgent: null };

describe('perform residual risk assessment service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the dedicated permission', async () => {
    await expect(
      riskManagementService.performResidualRiskAssessment(
        riskAssessmentId,
        input,
        { ...actor, permissions: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mocks.performResidualRiskAssessment).not.toHaveBeenCalled();
  });

  it('returns server-calculated residual risk', async () => {
    const result = {
      riskAssessmentId,
      residualRisk: { likelihood: 2, impact: 3, score: 6, level: 'medium', reduction: 14 },
    };
    mocks.performResidualRiskAssessment.mockResolvedValueOnce({ failure: null, result });
    await expect(
      riskManagementService.performResidualRiskAssessment(riskAssessmentId, input, actor, context),
    ).resolves.toEqual(result);
    expect(mocks.performResidualRiskAssessment).toHaveBeenCalledWith(
      riskAssessmentId,
      input,
      expect.objectContaining({ actorUserId: actor.userId, actorIsAdmin: false }),
    );
  });

  it.each([
    ['RISK_NOT_FOUND', 404, 'RISK_ASSESSMENT_NOT_FOUND'],
    ['PLAN_NOT_FOUND', 409, 'TREATMENT_PLAN_REQUIRED'],
    ['RISK_CHANGED', 409, 'RISK_ASSESSMENT_CHANGED'],
    ['ACTIONS_INCOMPLETE', 409, 'TREATMENT_ACTIONS_INCOMPLETE'],
    ['RESIDUAL_EXCEEDS_INHERENT', 422, 'RESIDUAL_EXCEEDS_INHERENT'],
    [
      'ACCEPT_WITHOUT_ACTIONS_MUST_MATCH_INHERENT',
      422,
      'ACCEPT_WITHOUT_ACTIONS_MUST_MATCH_INHERENT',
    ],
  ] as const)('maps %s to an actionable error', async (failure, statusCode, code) => {
    mocks.performResidualRiskAssessment.mockResolvedValueOnce({ failure, result: null });
    await expect(
      riskManagementService.performResidualRiskAssessment(riskAssessmentId, input, actor, context),
    ).rejects.toMatchObject({ statusCode, code });
  });
});
