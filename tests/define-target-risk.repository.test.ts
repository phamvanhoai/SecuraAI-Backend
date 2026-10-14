import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  risks: { findUnique: vi.fn() },
  risk_assessments: { create: vi.fn() },
  risk_treatment_plans: { update: vi.fn() },
  audit_logs: { create: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: (operation: (database: typeof db) => Promise<unknown>) => operation(db) },
}));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
const assessedAt = new Date('2026-10-01');
const current = {
  id: 'residual',
  assessed_at: assessedAt,
  residual_rating: 'HIGH',
  risk_appetite: 'LOW',
  risk_tolerance: 'MEDIUM',
  methodology_version: 'SECURAAI-RISK-MATRIX-v1',
};
const risk = {
  id: 'risk',
  risk_code: 'RSK',
  status: 'OPEN',
  owner_user_id: 'owner',
  review_date: null,
  risk_acceptances: [],
  risk_threats: [],
  risk_vulnerabilities: [],
  risk_assessments: [current],
  risk_treatment_plans: [{ id: 'plan', title: 'Treatment', strategy: 'MITIGATE' }],
};
const input = {
  treatmentPlanId: 'plan',
  targetRisk: 'low',
  rationale: 'The planned actions will reduce exposure.',
} as const;
describe('define target risk workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.risks.findUnique.mockResolvedValue(risk);
    db.$queryRaw.mockResolvedValue([{ time: new Date('2026-10-14') }]);
    db.risk_assessments.create.mockResolvedValue({
      id: 'target',
      assessed_at: new Date('2026-10-14'),
    });
  });
  it('records target separately without copying residual or inherent values', async () => {
    await expect(
      riskRegisterRepository.defineTargetRisk('risk', 'owner', input),
    ).resolves.toMatchObject({ kind: 'created' });
    const data = db.risk_assessments.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ assessment_type: 'TARGET_DEFINITION', target_risk: 'LOW' });
    expect(data).not.toHaveProperty('residual_rating');
    expect(data).not.toHaveProperty('inherent_rating');
    expect(db.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after_data: expect.objectContaining({
            treatmentPlanId: 'plan',
            residualAssessmentId: 'residual',
            residualAssessedAt: assessedAt.toISOString(),
          }),
        }),
      }),
    );
  });
  it.each(['ACCEPTED', 'CLOSED', 'ARCHIVED'])('blocks %s', async (status) => {
    db.risks.findUnique.mockResolvedValue({ ...risk, status });
    await expect(riskRegisterRepository.defineTargetRisk('risk', 'owner', input)).resolves.toEqual({
      kind: 'context_locked',
    });
    expect(db.risk_assessments.create).not.toHaveBeenCalled();
  });
  it('blocks pending acceptance', async () => {
    db.risks.findUnique.mockResolvedValue({ ...risk, risk_acceptances: [{ id: 'pending' }] });
    await expect(riskRegisterRepository.defineTargetRisk('risk', 'owner', input)).resolves.toEqual({
      kind: 'context_locked',
    });
  });
  it('detects edited threats', async () => {
    db.risks.findUnique.mockResolvedValue({
      ...risk,
      risk_threats: [{ created_at: assessedAt, updated_at: new Date('2026-10-10') }],
    });
    await expect(riskRegisterRepository.defineTargetRisk('risk', 'owner', input)).resolves.toEqual({
      kind: 'context_changed',
    });
  });
  it('allows a target outside tolerance with rationale when no higher than residual', async () => {
    await expect(
      riskRegisterRepository.defineTargetRisk('risk', 'owner', { ...input, targetRisk: 'high' }),
    ).resolves.toMatchObject({ kind: 'created' });
  });
  it('rejects a target higher than residual', async () => {
    await expect(
      riskRegisterRepository.defineTargetRisk('risk', 'owner', {
        ...input,
        targetRisk: 'critical',
      }),
    ).resolves.toEqual({ kind: 'target_exceeds_residual' });
  });
});
