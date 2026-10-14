import { beforeEach, describe, expect, it, vi } from 'vitest';
import { controlWeaknessesRepository } from '../src/modules/information-security-incident-management/control-weaknesses.repository.js';
import { controlWeaknessesService } from '../src/modules/information-security-incident-management/control-weaknesses.service.js';
vi.mock(
  '../src/modules/information-security-incident-management/control-weaknesses.repository.js',
  () => ({
    controlWeaknessesRepository: {
      findActor: vi.fn(),
      findIncident: vi.fn(),
      findLinkedControl: vi.fn(),
      findOptions: vi.fn(),
      findOpenWeakness: vi.fn(),
      listHistory: vi.fn(),
      create: vi.fn(),
    },
  }),
);
const userId = '11111111-1111-4111-8111-111111111111',
  incidentId = '22222222-2222-4222-8222-222222222222',
  controlId = '33333333-3333-4333-8333-333333333333';
const input = {
  controlId,
  severity: 'high' as const,
  description: 'MFA was not enforced for the affected remote account.',
};
describe('controlWeaknessesService.record', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires Security Officer', async () => {
    vi.mocked(controlWeaknessesRepository.findActor).mockResolvedValue({
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    await expect(controlWeaknessesService.record(userId, incidentId, input)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it('requires the control to be linked first', async () => {
    vi.mocked(controlWeaknessesRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(controlWeaknessesRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-1',
      title: 'Login',
      status: 'OPEN',
    });
    vi.mocked(controlWeaknessesRepository.findLinkedControl).mockResolvedValue(null);
    vi.mocked(controlWeaknessesRepository.findOpenWeakness).mockResolvedValue(null);
    await expect(controlWeaknessesService.record(userId, incidentId, input)).rejects.toMatchObject({
      code: 'CONTROL_NOT_LINKED',
    });
  });
  it('rejects a duplicate open weakness', async () => {
    vi.mocked(controlWeaknessesRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(controlWeaknessesRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-1',
      title: 'Login',
      status: 'OPEN',
    });
    vi.mocked(controlWeaknessesRepository.findLinkedControl).mockResolvedValue({
      security_controls: {
        id: controlId,
        control_code: 'CTRL-1',
        name: 'MFA',
        implementation_status: 'IMPLEMENTED',
      },
    });
    vi.mocked(controlWeaknessesRepository.findOpenWeakness).mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
    });
    await expect(controlWeaknessesService.record(userId, incidentId, input)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('controlWeaknessesService.history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the actor and timestamps for each historical finding', async () => {
    vi.mocked(controlWeaknessesRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(controlWeaknessesRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-1',
      title: 'Login',
      status: 'OPEN',
    });
    const identifiedAt = new Date('2026-10-01T02:00:00.000Z');
    vi.mocked(controlWeaknessesRepository.listHistory).mockResolvedValue({
      items: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          severity: 'high',
          description: 'MFA was not enforced for the affected account.',
          status: 'OPEN',
          identified_at: identifiedAt,
          resolved_at: null,
          security_controls: { id: controlId, control_code: 'CTRL-1', name: 'MFA' },
          users: { id: userId, full_name: 'Security Officer' },
        },
      ],
      total: 1,
    });

    const result = await controlWeaknessesService.history(userId, incidentId, {
      page: 1,
      limit: 10,
    });

    expect(result.items[0]).toMatchObject({
      status: 'open',
      identifiedAt,
      identifiedBy: { id: userId, fullName: 'Security Officer' },
    });
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });
});
