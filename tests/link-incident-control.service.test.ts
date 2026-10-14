import { beforeEach, describe, expect, it, vi } from 'vitest';
import { incidentControlsRepository } from '../src/modules/information-security-incident-management/incident-controls.repository.js';
import { incidentControlsService } from '../src/modules/information-security-incident-management/incident-controls.service.js';

vi.mock(
  '../src/modules/information-security-incident-management/incident-controls.repository.js',
  () => ({
    incidentControlsRepository: {
      findActor: vi.fn(),
      findIncident: vi.fn(),
      findControl: vi.fn(),
      findOptions: vi.fn(),
      link: vi.fn(),
      unlink: vi.fn(),
    },
  }),
);

const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const controlId = '33333333-3333-4333-8333-333333333333';

describe('incidentControlsService.options', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns bounded search results and pagination', async () => {
    const query = { q: 'MFA', scope: 'unlinked' as const, page: 2, limit: 10 };
    vi.mocked(incidentControlsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentControlsRepository.findOptions).mockResolvedValue({
      incident: {
        id: incidentId,
        incident_code: 'INC-001',
        title: 'Suspicious login',
        status: 'OPEN',
      },
      controls: [
        {
          id: controlId,
          control_code: 'CTRL-001',
          name: 'MFA',
          applicability: 'APPLICABLE',
          implementation_status: 'IMPLEMENTED',
          incident_controls: [],
        },
      ],
      total: 12,
    });
    await expect(incidentControlsService.options(userId, incidentId, query)).resolves.toMatchObject(
      {
        controls: [{ controlCode: 'CTRL-001', linked: false }],
        pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
      },
    );
  });
});

describe('incidentControlsService.link', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows only an active Security Officer', async () => {
    vi.mocked(incidentControlsRepository.findActor).mockResolvedValue({
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    await expect(
      incidentControlsService.link(userId, incidentId, { controlId }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
  it('rejects a missing security control', async () => {
    vi.mocked(incidentControlsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentControlsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Suspicious login',
      status: 'OPEN',
    });
    vi.mocked(incidentControlsRepository.findControl).mockResolvedValue(null);
    await expect(
      incidentControlsService.link(userId, incidentId, { controlId }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'CONTROL_NOT_FOUND' });
    expect(incidentControlsRepository.link).not.toHaveBeenCalled();
  });
  it('returns the linked incident and control', async () => {
    vi.mocked(incidentControlsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentControlsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Suspicious login',
      status: 'OPEN',
    });
    vi.mocked(incidentControlsRepository.findControl).mockResolvedValue({
      id: controlId,
      control_code: 'CTRL-001',
      name: 'MFA',
      applicability: 'APPLICABLE',
      implementation_status: 'IMPLEMENTED',
    });
    vi.mocked(incidentControlsRepository.link).mockResolvedValue({
      linked_at: new Date('2026-09-29T10:00:00Z'),
      incidents: { id: incidentId, incident_code: 'INC-001', title: 'Suspicious login' },
      security_controls: {
        id: controlId,
        control_code: 'CTRL-001',
        name: 'MFA',
        applicability: 'APPLICABLE',
        implementation_status: 'IMPLEMENTED',
      },
    });
    await expect(
      incidentControlsService.link(userId, incidentId, { controlId }),
    ).resolves.toMatchObject({
      incident: { incidentCode: 'INC-001' },
      control: { controlCode: 'CTRL-001' },
    });
  });
});

describe('incidentControlsService.unlink', () => {
  beforeEach(() => vi.clearAllMocks());
  it('removes an existing incident control link', async () => {
    vi.mocked(incidentControlsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentControlsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Suspicious login',
      status: 'OPEN',
    });
    vi.mocked(incidentControlsRepository.unlink).mockResolvedValue({ count: 1 });
    await expect(
      incidentControlsService.unlink(userId, incidentId, controlId),
    ).resolves.toBeUndefined();
  });
  it('rejects a control that is not linked to the incident', async () => {
    vi.mocked(incidentControlsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentControlsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Suspicious login',
      status: 'OPEN',
    });
    vi.mocked(incidentControlsRepository.unlink).mockResolvedValue({ count: 0 });
    await expect(
      incidentControlsService.unlink(userId, incidentId, controlId),
    ).rejects.toMatchObject({ statusCode: 404, code: 'INCIDENT_CONTROL_LINK_NOT_FOUND' });
  });
});
