import { Prisma, user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({
  riskRegisterRepository: { findActor: vi.fn(), list: vi.fn(), findById: vi.fn() },
}));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';

const query = { page: 1, limit: 10, sortBy: 'updatedAt' as const, sortOrder: 'desc' as const };
const now = new Date('2026-09-29T00:00:00.000Z');
const record = {
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
      users: {
        id: '00000000-0000-4000-8000-000000000005',
        full_name: 'Officer',
        status: 'ACTIVE' as const,
      },
    },
  ],
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
});
