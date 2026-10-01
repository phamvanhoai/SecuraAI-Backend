import { beforeEach, describe, expect, it, vi } from 'vitest';
import { riskReassessmentRequestsRepository } from '../src/modules/information-security-incident-management/risk-reassessment-requests.repository.js';
import { riskReassessmentRequestsService } from '../src/modules/information-security-incident-management/risk-reassessment-requests.service.js';

vi.mock(
  '../src/modules/information-security-incident-management/risk-reassessment-requests.repository.js',
  () => ({
    riskReassessmentRequestsRepository: {
      findActor: vi.fn(),
      findIncident: vi.fn(),
      findLinkedRisk: vi.fn(),
      findControlFinding: vi.fn(),
      findActiveRequest: vi.fn(),
      findOptions: vi.fn(),
      listHistory: vi.fn(),
      create: vi.fn(),
    },
  }),
);

const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const riskId = '33333333-3333-4333-8333-333333333333';
const input = {
  riskId,
  reason: 'The incident changes assumptions used by the current risk assessment.',
};

describe('riskReassessmentRequestsService.create', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires Security Officer', async () => {
    vi.mocked(riskReassessmentRequestsRepository.findActor).mockResolvedValue({
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    await expect(
      riskReassessmentRequestsService.create(userId, incidentId, input),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('requires a risk linked to the incident', async () => {
    vi.mocked(riskReassessmentRequestsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(riskReassessmentRequestsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-1',
      title: 'Login',
      status: 'OPEN',
    });
    vi.mocked(riskReassessmentRequestsRepository.findLinkedRisk).mockResolvedValue(null);
    vi.mocked(riskReassessmentRequestsRepository.findActiveRequest).mockResolvedValue(null);
    await expect(
      riskReassessmentRequestsService.create(userId, incidentId, input),
    ).rejects.toMatchObject({ code: 'RISK_NOT_LINKED' });
  });
  it('rejects a duplicate active request', async () => {
    vi.mocked(riskReassessmentRequestsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(riskReassessmentRequestsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-1',
      title: 'Login',
      status: 'OPEN',
    });
    vi.mocked(riskReassessmentRequestsRepository.findLinkedRisk).mockResolvedValue({
      risks: { id: riskId, risk_code: 'RISK-1', title: 'Compromise', status: 'OPEN' },
    });
    vi.mocked(riskReassessmentRequestsRepository.findActiveRequest).mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      status: 'PENDING',
    });
    await expect(
      riskReassessmentRequestsService.create(userId, incidentId, input),
    ).rejects.toMatchObject({ code: 'ACTIVE_REASSESSMENT_REQUEST_EXISTS' });
  });
});

describe('riskReassessmentRequestsService.history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ownership, review and pagination details', async () => {
    vi.mocked(riskReassessmentRequestsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(riskReassessmentRequestsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-1',
      title: 'Login',
      status: 'OPEN',
    });
    const requestedAt = new Date('2026-10-01T02:00:00.000Z');
    vi.mocked(riskReassessmentRequestsRepository.listHistory).mockResolvedValue({
      total: 1,
      items: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          reason: input.reason,
          status: 'PENDING',
          requested_at: requestedAt,
          reviewed_at: null,
          review_comment: null,
          risks: {
            id: riskId,
            risk_code: 'RISK-1',
            title: 'Compromise',
            status: 'OPEN',
            users_risks_owner_user_idTousers: {
              id: '55555555-5555-4555-8555-555555555555',
              full_name: 'Risk Owner',
            },
          },
          control_findings: null,
          users_risk_reassessment_requests_requested_byTousers: {
            id: userId,
            full_name: 'Security Officer',
          },
          users_risk_reassessment_requests_reviewed_byTousers: null,
        },
      ],
    });

    const result = await riskReassessmentRequestsService.history(userId, incidentId, {
      page: 1,
      limit: 10,
    });
    expect(result.items[0]).toMatchObject({
      status: 'pending',
      requestedBy: { fullName: 'Security Officer' },
      risk: { owner: { fullName: 'Risk Owner' } },
    });
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });
});
