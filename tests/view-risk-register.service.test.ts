import { Prisma, user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({
  riskRegisterRepository: {
    findActor: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
    findContextHistory: vi.fn().mockResolvedValue([]),
    findTargetHistory: vi.fn().mockResolvedValue([]),
    findAcceptanceAudits: vi.fn().mockResolvedValue([]),
    getAcceptanceControlLinks: vi.fn().mockResolvedValue([]),
  },
}));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';

const query = { page: 1, limit: 10, sortBy: 'updatedAt' as const, sortOrder: 'desc' as const };
const now = new Date('2026-09-29T00:00:00.000Z');
const record = {
  scope_type: null,
  business_services: null,
  id: '00000000-0000-4000-8000-000000000001',
  risk_code: 'RSK-001',
  title: 'Privileged access',
  description: null,
  status: 'OPEN' as const,
  review_date: null,
  created_at: now,
  updated_at: now,
  users_risks_owner_user_idTousers: {
    id: '00000000-0000-4000-8000-000000000002',
    full_name: 'Risk owner',
    status: 'ACTIVE' as const,
  },
  risk_assets: [
    {
      assets: {
        id: '00000000-0000-4000-8000-000000000003',
        asset_code: 'AST-001',
        name: 'Identity platform',
        status: 'ACTIVE' as const,
        criticality: 'HIGH',
      },
    },
  ],
  risk_assessments: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      assessment_type: 'INITIAL' as const,
      inherent_likelihood: 4,
      inherent_impact: 5,
      inherent_rating: 'CRITICAL' as const,
      control_effectiveness: new Prisma.Decimal(60),
      residual_likelihood: 2,
      residual_impact: 4,
      residual_rating: 'HIGH' as const,
      target_risk: 'MEDIUM' as const,
      risk_appetite: 'LOW' as const,
      risk_tolerance: 'MEDIUM' as const,
      assessment_reason: 'Initial assessment',
      assessed_at: now,
      review_date: null,
      methodology_version: 'SECURAAI-RISK-MATRIX-v1',
      users: {
        id: '00000000-0000-4000-8000-000000000005',
        full_name: 'Officer',
        status: 'ACTIVE' as const,
      },
    },
  ],
  risk_treatment_plans: [],
  _count: { control_risk_links: 2, risk_treatment_plans: 1, incident_risks: 1 },
};

describe('view risk register service', () => {
  beforeEach(() => vi.clearAllMocks());
  it('scopes non-Security Officers to risks they own', async () => {
    vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.ADMIN,
      status: user_status.ACTIVE,
    });
    vi.mocked(riskRegisterRepository.list).mockResolvedValue([0, []]);
    await riskRegisterService.list('u', query);
    expect(riskRegisterRepository.list).toHaveBeenCalledWith({ ...query, ownerId: 'u' });
  });
  it('maps V2 risk relationships into a bounded register page', async () => {
    vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.SECURITY_OFFICER,
      status: user_status.ACTIVE,
    });
    vi.mocked(riskRegisterRepository.list).mockResolvedValue([1, [record]]);
    const result = await riskRegisterService.list('u', query);
    expect(result.items[0]).toMatchObject({
      riskCode: 'RSK-001',
      status: 'open',
      latestAssessment: { inherentRating: 'critical', controlEffectiveness: 60 },
      linkedCounts: { controls: 2, treatmentPlans: 1, incidents: 1 },
    });
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });

  it('returns not found only after authorization succeeds', async () => {
    vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.SECURITY_OFFICER,
      status: user_status.ACTIVE,
    });
    vi.mocked(riskRegisterRepository.findById).mockResolvedValue(null);
    await expect(
      riskRegisterService.get('u', '00000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({ statusCode: 404, code: 'RISK_NOT_FOUND' });
  });
  it('keeps request and decision reasons separate and exposes expired rejection to an approver', async () => {
    const acceptanceId = '00000000-0000-4000-8000-000000000099';
    vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({ id: 'approver', role: user_role.SECURITY_OFFICER, status: user_status.ACTIVE });
    vi.mocked(riskRegisterRepository.findById).mockResolvedValue({ ...record, users_risks_created_byTousers: record.users_risks_owner_user_idTousers,
      risk_threats: [], risk_vulnerabilities: [], control_risk_links: [], risk_treatment_plans: [], incident_risks: [],
      risk_acceptances: [{ id: acceptanceId, decision: 'PENDING', reason: 'Owner justification', requested_at: now, valid_until: new Date('2020-01-01'), requested_by: record.users_risks_owner_user_idTousers.id, decided_by: null, decided_at: null }],
    });
    vi.mocked(riskRegisterRepository.findAcceptanceAudits).mockResolvedValue([{ action: 'RISK_ACCEPTANCE_SUBMITTED', occurred_at: now, after_data: { acceptanceId, acceptanceReason: 'Original Owner justification' } }]);
    const result = await riskRegisterService.get('approver', record.id);
    expect(result.acceptances[0]).toMatchObject({ requestReason: 'Original Owner justification', decisionReason: null, expired: true, canDecide: true });
    expect(result.acceptances[0]?.approvalBlockedReason).toMatch(/expired/);
  });
  it('exposes review only to the assigned Owner of an accepted Risk', async () => {
    const ownerId = record.users_risks_owner_user_idTousers.id;
    vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({ id: ownerId, role: user_role.EMPLOYEE, status: user_status.ACTIVE });
    vi.mocked(riskRegisterRepository.findById).mockResolvedValue({ ...record, status: 'ACCEPTED', users_risks_created_byTousers: record.users_risks_owner_user_idTousers,
      risk_threats: [], risk_vulnerabilities: [], control_risk_links: [], risk_treatment_plans: [], incident_risks: [], risk_acceptances: [],
    });
    vi.mocked(riskRegisterRepository.findAcceptanceAudits).mockResolvedValue([]);
    const result = await riskRegisterService.get(ownerId, record.id);
    expect(result.acceptanceWorkflow).toMatchObject({ canOpenReview: true, canSubmit: false });
  });
  it('returns the explicitly saved service without deriving it from assets', async () => {
    vi.mocked(riskRegisterRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.SECURITY_OFFICER,
      status: user_status.ACTIVE,
    });
    vi.mocked(riskRegisterRepository.list).mockResolvedValue([
      1,
      [
        {
          ...record,
          scope_type: 'BUSINESS_SERVICE',
          business_services: { id: 'service', name: 'Customer service', status: 'INACTIVE' },
        },
      ],
    ]);
    const result = await riskRegisterService.list('u', query);
    expect(result.items[0]?.scope).toEqual({
      type: 'business_service',
      businessService: { id: 'service', name: 'Customer service', status: 'inactive' },
    });
    expect(result.items[0]?.assets).toHaveLength(1);
  });
});
