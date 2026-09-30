import { beforeEach, describe, expect, it, vi } from 'vitest';
import { incidentRisksRepository } from '../src/modules/information-security-incident-management/incident-risks.repository.js';
import { incidentRisksService } from '../src/modules/information-security-incident-management/incident-risks.service.js';
vi.mock(
  '../src/modules/information-security-incident-management/incident-risks.repository.js',
  () => ({
    incidentRisksRepository: {
      findActor: vi.fn(),
      findIncident: vi.fn(),
      findRisk: vi.fn(),
      findOptions: vi.fn(),
      link: vi.fn(),
    },
  }),
);
const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const riskId = '33333333-3333-4333-8333-333333333333';
describe('incidentRisksService.link', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows only an active Security Officer', async () => {
    vi.mocked(incidentRisksRepository.findActor).mockResolvedValue({
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    await expect(incidentRisksService.link(userId, incidentId, { riskId })).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it('rejects a missing or archived risk', async () => {
    vi.mocked(incidentRisksRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentRisksRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Login',
      status: 'OPEN',
    });
    vi.mocked(incidentRisksRepository.findRisk).mockResolvedValue(null);
    await expect(incidentRisksService.link(userId, incidentId, { riskId })).rejects.toMatchObject({
      code: 'RISK_NOT_FOUND',
    });
  });
  it('returns the linked incident and risk', async () => {
    const risk = {
      id: riskId,
      risk_code: 'RSK-001',
      title: 'Credential compromise',
      status: 'OPEN' as const,
      review_date: null,
    };
    vi.mocked(incidentRisksRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentRisksRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Login',
      status: 'OPEN',
    });
    vi.mocked(incidentRisksRepository.findRisk).mockResolvedValue(risk);
    vi.mocked(incidentRisksRepository.link).mockResolvedValue({
      linked_at: new Date(),
      incidents: { id: incidentId, incident_code: 'INC-001', title: 'Login' },
      risks: risk,
    });
    await expect(incidentRisksService.link(userId, incidentId, { riskId })).resolves.toMatchObject({
      risk: { riskCode: 'RSK-001' },
    });
  });
});
