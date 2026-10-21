import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/information-security-incident-management/incidents.repository.js', () => ({
  incidentsRepository: {
    findActor: vi.fn(),
    listSourceOptions: vi.fn(),
    createFromSource: vi.fn(),
  },
}));

import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';
import { incidentsService } from '../src/modules/information-security-incident-management/incidents.service.js';

const userId = '8d50d98d-9434-42ad-8f31-f835b3a9098f';
const sourceId = 'b23cae8a-9c5c-42a1-984d-6850935f6b33';
const input = {
  sourceType: 'finding' as const,
  sourceId,
  title: 'Confirmed privileged account compromise',
  description: 'The confirmed finding indicates unauthorized privileged account activity.',
  severity: 'high' as const,
};

describe('incidentsService.createFromSource', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an active Security Officer', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EXECUTIVE',
      status: 'ACTIVE',
    });
    await expect(incidentsService.createFromSource(userId, input)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('rejects a source that already has an incident', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentsRepository.createFromSource).mockResolvedValue({
      outcome: 'already_converted',
      incident: { id: sourceId, incident_code: 'INC-EXISTING' },
    });
    await expect(incidentsService.createFromSource(userId, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'INCIDENT_SOURCE_ALREADY_CONVERTED',
    });
  });

  it('allows an active Employee to create a manual incident report', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    const manualInput = {
      sourceType: 'manual' as const,
      title: 'Suspicious email reported by employee',
      description: 'The employee received an unexpected attachment requesting credentials.',
      severity: 'medium' as const,
    };
    vi.mocked(incidentsRepository.createFromSource).mockResolvedValue({
      outcome: 'created',
      incident: {
        id: sourceId,
        incident_code: 'INC-EMPLOYEE-001',
        title: manualInput.title,
        description: manualInput.description,
        severity: 'MEDIUM',
        status: 'OPEN',
        handler_user_id: null,
        detected_at: null,
        confirmed_at: null,
        closed_at: null,
        created_at: new Date('2026-10-21T00:00:00Z'),
        updated_at: new Date('2026-10-21T00:00:00Z'),
        incident_analysis: null,
        users_incidents_created_byTousers: {
          id: userId,
          full_name: 'Employee Reporter',
          email: 'employee@example.com',
        },
        users_incidents_handler_user_idTousers: null,
        security_findings: null,
        _count: {
          incident_actions: 0,
          incident_assets: 0,
          incident_controls: 0,
          incident_evidence: 0,
          incident_risks: 0,
        },
      },
    });

    await expect(incidentsService.createFromSource(userId, manualInput)).resolves.toMatchObject({
      incidentCode: 'INC-EMPLOYEE-001',
      status: 'open',
    });
  });
});
