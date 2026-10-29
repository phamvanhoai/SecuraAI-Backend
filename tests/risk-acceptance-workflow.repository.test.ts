import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  users: { findUnique: vi.fn() },
  risks: { findUnique: vi.fn(), update: vi.fn() },
  risk_assessments: { findFirst: vi.fn(), create: vi.fn() },
  risk_treatment_plans: { findFirst: vi.fn(), update: vi.fn() },
  risk_acceptances: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  audit_logs: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: (work: (database: typeof db) => Promise<unknown>) => work(db) },
}));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { residualControlBasis } from '../src/modules/risk-assessment/residual-control-basis.js';
const old = new Date('2026-10-01T00:00:00Z');
const now = new Date('2026-10-14T09:00:00Z');
const links = [
  {
    security_controls: {
      id: 'control',
      implementation_status: 'IMPLEMENTED' as const,
      applicability: 'APPLICABLE' as const,
      updated_at: old,
      control_assessments: [
        { id: 'control-test', effectiveness: new Prisma.Decimal(80), assessed_at: old },
      ],
      control_evidence_links: [
        {
          linked_at: old,
          evidence_items: {
            id: 'evidence',
            status: 'ACTIVE' as const,
            collected_at: old,
            valid_from: null,
            valid_until: null,
          },
        },
      ],
    },
  },
];
const risk = {
  id: 'risk',
  risk_code: 'RSK',
  owner_user_id: 'owner',
  status: 'OPEN',
  review_date: null,
  updated_at: old,
  risk_threats: [],
  risk_vulnerabilities: [],
  control_risk_links: links,
  risk_acceptances: [],
  risk_assessments: [
    {
      id: 'residual',
      assessed_at: old,
      residual_rating: 'HIGH',
      risk_appetite: 'MEDIUM',
      risk_tolerance: 'MEDIUM',
    },
  ],
  risk_treatment_plans: [
    {
      id: 'plan',
      status: 'ACTIVE',
      updated_at: old,
      risk_treatment_actions: [{ status: 'IN_PROGRESS' }],
      risk_assessments: { target_risk: 'LOW' },
    },
  ],
};
const input = {
  residualLikelihood: 1,
  residualImpact: 3,
  assessmentReason: 'Current controls reduce the remaining exposure.',
  treatmentPlanId: 'plan',
  validUntil: '2027-01-01',
  acceptanceReason: 'Accept remaining exposure with ongoing monitoring.',
};
const request = {
  id: 'request',
  risk_id: 'risk',
  requested_by: 'owner',
  requested_at: old,
  decision: 'PENDING',
  reason: input.acceptanceReason,
  valid_until: new Date('2027-01-01'),
  risks: risk,
};
beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([{ time: now }]);
  db.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  db.risks.findUnique.mockResolvedValue(risk);
  db.risks.update.mockResolvedValue({ id: 'risk', status: 'OPEN', updated_at: now });
  db.risk_assessments.findFirst.mockResolvedValue({
    id: 'residual',
    assessed_at: old,
    inherent_likelihood: 4,
    inherent_impact: 4,
    inherent_rating: 'HIGH',
  });
  db.risk_assessments.create.mockResolvedValue({ id: 'new-residual', assessed_at: now });
  db.risk_acceptances.create.mockResolvedValue({
    id: 'request',
    decision: 'PENDING',
    requested_at: now,
    valid_until: new Date('2027-01-01'),
  });
  db.risk_acceptances.findUnique.mockResolvedValue(request);
  db.risk_acceptances.update.mockResolvedValue({ ...request, decision: 'APPROVED' });
  db.risk_treatment_plans.findFirst.mockResolvedValue({ updated_at: old });
  db.audit_logs.findFirst.mockResolvedValue(null);
  db.audit_logs.findMany.mockResolvedValue([]);
});
describe('acceptance submission', () => {
  it('blocks an open review before any acceptance or assessment writes', async () => {
    db.audit_logs.findMany.mockResolvedValue([{ action: 'RISK_REVIEW_OPENED', occurred_at: old, after_data: { reason: 'Periodic review' } }]);
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toEqual({ kind: 'review_in_progress' });
    expect(db.risk_acceptances.create).not.toHaveBeenCalled();
    expect(db.risk_assessments.create).not.toHaveBeenCalled();
  });
  it('permits acceptance after the latest review was completed', async () => {
    db.audit_logs.findMany.mockResolvedValue([
      { action: 'RISK_REVIEW_COMPLETED', occurred_at: now, after_data: {} },
      { action: 'RISK_REVIEW_OPENED', occurred_at: old, after_data: {} },
    ]);
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toMatchObject({ kind: 'submitted' });
    expect(db.risk_acceptances.create).toHaveBeenCalledTimes(1);
  });
  it('blocks a newly opened review even after an older completed cycle', async () => {
    db.audit_logs.findMany.mockResolvedValue([
      { action: 'RISK_REVIEW_OPENED', occurred_at: now, after_data: {} },
      { action: 'RISK_REVIEW_COMPLETED', occurred_at: old, after_data: {} },
    ]);
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toEqual({ kind: 'review_in_progress' });
    expect(db.risk_acceptances.create).not.toHaveBeenCalled();
  });
  it('blocks legacy Accept plans without costs before creating a request', async () => {
    db.risks.findUnique.mockResolvedValue({ ...risk, risk_treatment_plans: [{ ...risk.risk_treatment_plans[0], strategy: 'ACCEPT', acceptance_cost_basis: null }] });
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toEqual({ kind: 'acceptance_cost_required' });
    expect(db.risk_acceptances.create).not.toHaveBeenCalled();
  });
  it('snapshots Accept costs without approving the Risk', async () => {
    const acceptanceCost = { costToFix: '100000000', expectedLoss: '5000000', currency: 'VND', periodMonths: 12, basis: 'Synthetic comparison over twelve months.' };
    db.risks.findUnique.mockResolvedValue({ ...risk, risk_treatment_plans: [{ ...risk.risk_treatment_plans[0], strategy: 'ACCEPT', acceptance_cost_basis: acceptanceCost, risk_treatment_actions: [] }] });
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toMatchObject({ kind: 'submitted' });
    expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ after_data: expect.objectContaining({ acceptanceCost }) }) }));
    expect(db.risks.update).not.toHaveBeenCalled();
  });
  it('rejects an imported Completed mitigation plan with all actions cancelled', async () => {
    db.risks.findUnique.mockResolvedValue({ ...risk, risk_treatment_plans: [{ ...risk.risk_treatment_plans[0], status: 'COMPLETED', strategy: 'MITIGATE', risk_treatment_actions: [{ status: 'CANCELLED' }] }] });
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toEqual({ kind: 'no_completed_actions' });
  });
  it('records current basis without changing plan or overwriting its source', async () => {
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toMatchObject({
      kind: 'submitted',
    });
    expect(db.risk_treatment_plans.update).not.toHaveBeenCalled();
    expect(db.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'RISK_ACCEPTANCE_SUBMITTED',
          after_data: expect.objectContaining({
            assessmentId: 'new-residual',
            acceptanceReason: input.acceptanceReason,
          }),
        }),
      }),
    );
    expect(db.risk_assessments.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ control_effectiveness: 80 }) }),
    );
  });
  it('rejects plan status changes through the compatibility field', async () => {
    expect(
      await riskRegisterRepository.submitAcceptance('risk', 'owner', {
        ...input,
        treatmentPlanStatus: 'completed',
      }),
    ).toEqual({ kind: 'invalid_plan_status' });
  });
  it.each(['risk_threats', 'risk_vulnerabilities'])('checks edits to %s', async (field) => {
    db.risks.findUnique.mockResolvedValue({
      ...risk,
      [field]: [{ created_at: old, updated_at: now }],
    });
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toEqual({
      kind: 'context_changed',
    });
    expect(db.risk_acceptances.create).not.toHaveBeenCalled();
  });
  it('blocks changed control configuration', async () => {
    db.risks.findUnique.mockResolvedValue({
      ...risk,
      control_risk_links: [
        { security_controls: { ...links[0]?.security_controls, updated_at: now } },
      ],
    });
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toEqual({
      kind: 'control_assessments_stale',
    });
  });
  it('requires new residual after reopening review', async () => {
    db.audit_logs.findFirst.mockResolvedValue({ occurred_at: now });
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toEqual({
      kind: 'context_changed',
    });
  });
  it('rejects inactive or reassigned Owner', async () => {
    db.users.findUnique.mockResolvedValue({ status: 'INACTIVE' });
    expect(await riskRegisterRepository.submitAcceptance('risk', 'owner', input)).toEqual({
      kind: 'not_owner',
    });
  });
});
describe('acceptance decision', () => {
  it.each(['DRAFT', 'ACTIVE'])('completes only the submitted Accept plan from %s on approval', async (status) => {
    const cost = { costToFix: '100', expectedLoss: '5', currency: 'VND', periodMonths: 12, basis: 'Synthetic comparison of estimated costs.' };
    db.audit_logs.findFirst.mockResolvedValue({ after_data: { assessmentId: 'residual', treatmentPlanId: 'plan', planUpdatedAt: old.toISOString(), controlBasis: residualControlBasis(links) } });
    db.risk_treatment_plans.findFirst.mockResolvedValue({ id: 'plan', status, strategy: 'ACCEPT', updated_at: old, acceptance_cost_basis: cost });
    expect(await riskRegisterRepository.decideAcceptance('request', 'approver', { decision: 'approved', reason: 'Approve after independent review.' })).toMatchObject({ kind: 'decided' });
    expect(db.risk_treatment_plans.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'plan' }, data: { status: 'COMPLETED', updated_at: now } });
    expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'RISK_TREATMENT_PLAN_COMPLETED_BY_ACCEPTANCE', after_data: expect.objectContaining({ acceptanceId: 'request', status: 'COMPLETED' }) }) }));
  });
  it('does not complete an Accept plan on rejection', async () => {
    expect(await riskRegisterRepository.decideAcceptance('request', 'approver', { decision: 'rejected', reason: 'More justification is required.' })).toMatchObject({ kind: 'decided' });
    expect(db.risk_treatment_plans.update).not.toHaveBeenCalled();
    expect(db.risks.update).not.toHaveBeenCalled();
  });
  it.each(['MITIGATE', 'AVOID', 'TRANSFER'])('does not auto-complete a %s plan', async (strategy) => {
    db.audit_logs.findFirst.mockResolvedValue({ after_data: { assessmentId: 'residual', treatmentPlanId: 'plan', planUpdatedAt: old.toISOString(), controlBasis: residualControlBasis(links) } });
    db.risk_treatment_plans.findFirst.mockResolvedValue({ id: 'plan', strategy, status: 'ACTIVE', updated_at: old });
    expect(await riskRegisterRepository.decideAcceptance('request', 'approver', { decision: 'approved', reason: 'Approve after independent review.' })).toMatchObject({ kind: 'decided' });
    expect(db.risk_treatment_plans.update).not.toHaveBeenCalled();
  });
  const approve = { decision: 'approved' as const, reason: 'Approved after independent review.' };
  const basis = {
    after_data: {
      assessmentId: 'residual',
      treatmentPlanId: 'plan',
      planUpdatedAt: old.toISOString(),
      controlBasis: residualControlBasis(links),
    },
  };
  it('approves the exact submitted basis and preserves justification', async () => {
    db.audit_logs.findFirst.mockResolvedValue(basis);
    expect(
      await riskRegisterRepository.decideAcceptance('request', 'approver', approve),
    ).toMatchObject({ kind: 'decided' });
    expect(db.risk_acceptances.update.mock.calls[0]?.[0].data).not.toHaveProperty('reason');
    expect(db.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after_data: expect.objectContaining({
            decisionReason: approve.reason,
            requestReason: input.acceptanceReason,
          }),
        }),
      }),
    );
  });
  it('blocks legacy approval without verifiable basis but permits rejection', async () => {
    expect(await riskRegisterRepository.decideAcceptance('request', 'approver', approve)).toEqual({
      kind: 'context_changed',
    });
    expect(
      await riskRegisterRepository.decideAcceptance('request', 'approver', {
        ...approve,
        decision: 'rejected',
      }),
    ).toMatchObject({ kind: 'decided' });
  });
  it('rejects stale plan revision', async () => {
    db.audit_logs.findFirst.mockResolvedValue(basis);
    db.risk_treatment_plans.findFirst.mockResolvedValue({ updated_at: now });
    expect(await riskRegisterRepository.decideAcceptance('request', 'approver', approve)).toEqual({
      kind: 'context_changed',
    });
  });
  it('rejects owner reassignment', async () => {
    db.risk_acceptances.findUnique.mockResolvedValue({
      ...request,
      risks: { ...risk, owner_user_id: 'new-owner' },
    });
    expect(await riskRegisterRepository.decideAcceptance('request', 'approver', approve)).toEqual({
      kind: 'context_changed',
    });
  });
  it('rejects self approval and inactive approver', async () => {
    expect(await riskRegisterRepository.decideAcceptance('request', 'owner', approve)).toEqual({
      kind: 'self_approval',
    });
    db.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    expect(await riskRegisterRepository.decideAcceptance('request', 'approver', approve)).toEqual({
      kind: 'forbidden',
    });
  });
  it('rejects a different latest residual assessment', async () => {
    db.audit_logs.findFirst.mockResolvedValue(basis);
    db.risk_assessments.findFirst.mockResolvedValue({ id: 'different' });
    expect(await riskRegisterRepository.decideAcceptance('request', 'approver', approve)).toEqual({
      kind: 'context_changed',
    });
  });
});
describe('opening review', () => {
  const review = {
    reason: 'Acceptance expired; review current remaining risk.',
    expectedUpdatedAt: old.toISOString(),
  };
  it.each(['OPEN', 'UNDER_TREATMENT'])('starts review on %s retaining its status and old deadline', async (status) => {
    const deadline = new Date('2026-10-16T00:00:00Z');
    db.audit_logs.findMany.mockResolvedValueOnce([]);
    db.users.findUnique.mockResolvedValueOnce({ status: 'ACTIVE', full_name: 'Owner snapshot' });
    db.risks.findUnique.mockResolvedValueOnce({ ...risk, status, review_date: deadline });
    await expect(riskRegisterRepository.openAcceptanceReview('risk', 'owner', review)).resolves.toMatchObject({ kind: 'opened' });
    expect(db.risks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status, updated_at: now } }));
    expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ after_data: {
      status, reason: review.reason, openedBy: 'owner', openedByName: 'Owner snapshot', previousReviewDate: deadline.toISOString(),
    } }) }));
  });
  it('blocks another review under the same Risk lock', async () => {
    db.audit_logs.findMany.mockResolvedValueOnce([{ action: 'RISK_REVIEW_OPENED', occurred_at: old, after_data: { reason: 'Earlier review' } }]);
    expect(await riskRegisterRepository.openAcceptanceReview('risk', 'owner', review)).toEqual({ kind: 'review_already_open' });
    expect(db.audit_logs.create).not.toHaveBeenCalled();
    expect(db.risks.update).not.toHaveBeenCalled();
  });
  it.each(['CLOSED', 'ARCHIVED'])('does not review %s risks', async (status) => {
    db.risks.findUnique.mockResolvedValueOnce({ ...risk, status });
    expect(await riskRegisterRepository.openAcceptanceReview('risk', 'owner', review)).toEqual({ kind: 'context_locked' });
  });
  it('blocks review while acceptance is pending', async () => {
    db.risks.findUnique.mockResolvedValueOnce({ ...risk, risk_acceptances: [{ id: 'pending' }] });
    expect(await riskRegisterRepository.openAcceptanceReview('risk', 'owner', review)).toEqual({ kind: 'context_locked' });
  });
  it('reopens the same accepted Risk preserving acceptance records', async () => {
    db.risks.findUnique.mockResolvedValue({ ...risk, status: 'ACCEPTED' });
    expect(
      await riskRegisterRepository.openAcceptanceReview('risk', 'owner', review),
    ).toMatchObject({ kind: 'opened' });
    expect(db.risks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'UNDER_TREATMENT' }) }),
    );
    expect(db.risk_acceptances.update).not.toHaveBeenCalled();
  });
  it('rejects stale revision and non-Owner', async () => {
    db.risks.findUnique.mockResolvedValue({ ...risk, status: 'ACCEPTED' });
    expect(
      await riskRegisterRepository.openAcceptanceReview('risk', 'owner', {
        ...review,
        expectedUpdatedAt: now.toISOString(),
      }),
    ).toEqual({ kind: 'stale' });
    expect(await riskRegisterRepository.openAcceptanceReview('risk', 'other', review)).toEqual({
      kind: 'not_owner',
    });
  });
});
