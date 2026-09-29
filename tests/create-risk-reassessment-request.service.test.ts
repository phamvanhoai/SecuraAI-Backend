import { beforeEach, describe, expect, it, vi } from 'vitest';
import { riskReassessmentRequestsRepository } from '../src/modules/information-security-incident-management/risk-reassessment-requests.repository.js';
import { riskReassessmentRequestsService } from '../src/modules/information-security-incident-management/risk-reassessment-requests.service.js';

vi.mock('../src/modules/information-security-incident-management/risk-reassessment-requests.repository.js', () => ({
  riskReassessmentRequestsRepository: {
    findActor: vi.fn(), findIncident: vi.fn(), findLinkedRisk: vi.fn(),
    findControlFinding: vi.fn(), findActiveRequest: vi.fn(), findOptions: vi.fn(), create: vi.fn(),
  },
}));

const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const riskId = '33333333-3333-4333-8333-333333333333';
const input = { riskId, reason: 'The incident changes assumptions used by the current risk assessment.' };

describe('riskReassessmentRequestsService.create', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires Security Officer', async () => {
    vi.mocked(riskReassessmentRequestsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await expect(riskReassessmentRequestsService.create(userId, incidentId, input)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('requires a risk linked to the incident', async () => {
    vi.mocked(riskReassessmentRequestsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(riskReassessmentRequestsRepository.findIncident).mockResolvedValue({ id: incidentId, incident_code: 'INC-1', title: 'Login', status: 'OPEN' });
    vi.mocked(riskReassessmentRequestsRepository.findLinkedRisk).mockResolvedValue(null);
    vi.mocked(riskReassessmentRequestsRepository.findActiveRequest).mockResolvedValue(null);
    await expect(riskReassessmentRequestsService.create(userId, incidentId, input)).rejects.toMatchObject({ code: 'RISK_NOT_LINKED' });
  });
  it('rejects a duplicate active request', async () => {
    vi.mocked(riskReassessmentRequestsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(riskReassessmentRequestsRepository.findIncident).mockResolvedValue({ id: incidentId, incident_code: 'INC-1', title: 'Login', status: 'OPEN' });
    vi.mocked(riskReassessmentRequestsRepository.findLinkedRisk).mockResolvedValue({ risks: { id: riskId, risk_code: 'RISK-1', title: 'Compromise', status: 'OPEN' } });
    vi.mocked(riskReassessmentRequestsRepository.findActiveRequest).mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444', status: 'PENDING' });
    await expect(riskReassessmentRequestsService.create(userId, incidentId, input)).rejects.toMatchObject({ code: 'ACTIVE_REASSESSMENT_REQUEST_EXISTS' });
  });
});
