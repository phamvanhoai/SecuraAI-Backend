import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  risks: { findUnique: vi.fn() },
  risk_assessments: { findFirst: vi.fn(), create: vi.fn() },
  audit_logs: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (operation: (database: typeof db) => Promise<unknown>) => operation(db),
  },
}));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
const time = new Date('2026-01-01');
const input = {
  likelihood: 2,
  impact: 3,
  targetRisk: 'low',
  riskAppetite: 'medium',
  riskTolerance: 'medium',
  assessmentReason: 'Remaining exposure after control verification.',
} as const;
const risk = {
  id: 'risk',
  risk_code: 'RSK',
  owner_user_id: 'owner',
  status: 'OPEN',
  review_date: null,
  risk_acceptances: [],
  risk_threats: [],
  risk_vulnerabilities: [],
  risk_assessments: [
    { inherent_likelihood: 4, inherent_impact: 4, inherent_rating: 'HIGH', assessed_at: time },
  ],
  control_risk_links: [
    {
      security_controls: {
        id: 'control',
        applicability: 'APPLICABLE',
        implementation_status: 'IMPLEMENTED',
        updated_at: time,
        control_assessments: [
          { id: 'test', assessed_at: time, effectiveness: { toNumber: () => 80 } },
        ],
        control_evidence_links: [
          {
            linked_at: time,
            evidence_items: {
              id: 'evidence',
              status: 'ACTIVE',
              collected_at: time,
              valid_from: null,
              valid_until: null,
            },
          },
        ],
      },
    },
  ],
};
describe('residual risk workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.risks.findUnique.mockResolvedValue(risk);
    db.audit_logs.findFirst.mockResolvedValue({ record_hash: 'previous-risk-hash' });
    db.risk_assessments.findFirst.mockResolvedValue(null);
    db.risk_assessments.create.mockResolvedValue({ id: 'assessment', assessed_at: time });
    db.$queryRaw.mockResolvedValue([{ time }]);
  });
  it('saves a valid assessment and records its control assessment basis', async () => {
    await expect(
      riskRegisterRepository.assessResidualRisk('risk', 'owner', input),
    ).resolves.toMatchObject({ kind: 'created' });
    expect(db.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          previous_hash: 'previous-risk-hash',
          record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          after_data: expect.objectContaining({
            controlBasis: [expect.objectContaining({ assessmentId: 'test', controlId: 'control' })],
          }),
        }),
      }),
    );
  });
  it('propagates a failed chain-head read rather than reporting a successful assessment', async () => {
    db.audit_logs.findFirst.mockRejectedValueOnce(new Error('audit chain unavailable'));
    await expect(riskRegisterRepository.assessResidualRisk('risk', 'owner', input)).rejects.toThrow('audit chain unavailable');
    expect(db.audit_logs.create).not.toHaveBeenCalled();
  });
  it.each(['ACCEPTED' , 'CLOSED', 'ARCHIVED'])('blocks %s', async (status) => {
    db.risks.findUnique.mockResolvedValue({ ...risk, status });
    await expect(
      riskRegisterRepository.assessResidualRisk('risk', 'owner', input),
    ).resolves.toEqual({ kind: 'context_locked' });
    expect(db.risk_assessments.create).not.toHaveBeenCalled();
  });
  it('rejects changing established thresholds', async () => {
    db.risk_assessments.findFirst.mockResolvedValue({
      risk_appetite: 'LOW',
      risk_tolerance: 'LOW',
    });
    await expect(
      riskRegisterRepository.assessResidualRisk('risk', 'owner', input),
    ).resolves.toEqual({ kind: 'thresholds_changed' });
  });
  it('blocks pending acceptance', async () => {
    db.risks.findUnique.mockResolvedValue({ ...risk, risk_acceptances: [{ id: 'pending' }] });
    await expect(riskRegisterRepository.assessResidualRisk('risk', 'owner', input)).resolves.toEqual({ kind: 'pending_acceptance' });
  });
  it('blocks another user', async () => {
    await expect(riskRegisterRepository.assessResidualRisk('risk', 'other', input)).resolves.toEqual({ kind: 'not_owner' });
  });
  it('rejects control results predating a control edit', async () => {
    db.risks.findUnique.mockResolvedValue({ ...risk, control_risk_links: [{ security_controls: {
      ...risk.control_risk_links[0]?.security_controls, updated_at: new Date('2026-02-01'),
    } }] });
    await expect(riskRegisterRepository.assessResidualRisk('risk', 'owner', input)).resolves.toEqual({ kind: 'control_assessments_stale' });
    expect(db.risk_assessments.create).not.toHaveBeenCalled();
  });
  it('requires inherent reassessment after a threat edit', async () => {
    db.risks.findUnique.mockResolvedValue({
      ...risk,
      risk_threats: [{ created_at: time, updated_at: new Date('2026-02-01') }],
    });
    await expect(
      riskRegisterRepository.assessResidualRisk('risk', 'owner', input),
    ).resolves.toEqual({ kind: 'context_changed' });
  });
});
