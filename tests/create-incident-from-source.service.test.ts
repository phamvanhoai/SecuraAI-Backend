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
});
