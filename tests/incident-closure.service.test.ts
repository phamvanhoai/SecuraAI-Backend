import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  incident: vi.fn(),
  record: vi.fn(),
  close: vi.fn(),
}));
vi.mock(
  '../src/modules/information-security-incident-management/incident-closure.repository.js',
  async (original) => ({ ...(await original<object>()), incidentClosureRepository: mocks }),
);
vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
import { incidentClosureService } from '../src/modules/information-security-incident-management/incident-closure.service.js';
const input = {
  summary: 'Response and recovery validated.',
  confirmed: true as const,
  expectedUpdatedAt: '2026-01-01T00:00:00Z',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.incident.mockResolvedValue({
    status: 'LESSONS_LEARNED',
    updated_at: new Date(input.expectedUpdatedAt),
    closed_at: null,
    incident_analysis: {
      root_cause: 'Cause',
      lessons_learned: 'Lessons',
      improvement_actions: 'Recommendations',
    },
  });
  mocks.record.mockResolvedValue(null);
  mocks.close.mockResolvedValue({ changed: true, closedAt: new Date() });
});
it('returns backend readiness, no invented closure metadata', async () => {
  expect(await incidentClosureService.current('officer', 'incident')).toMatchObject({
    canClose: true,
    closure: null,
    closedAt: null,
  });
});
it('allows executives to review but not close', async () => {
  mocks.actor.mockResolvedValue({ role: 'EXECUTIVE', status: 'ACTIVE' });
  expect(await incidentClosureService.current('executive', 'incident')).toMatchObject({
    canClose: false,
  });
  await expect(incidentClosureService.close('executive', 'incident', input)).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(mocks.close).not.toHaveBeenCalled();
});
it.each(['ADMIN', 'EMPLOYEE'])('denies %s incident read and write', async (role) => {
  mocks.actor.mockResolvedValue({ role, status: 'ACTIVE' });
  await expect(incidentClosureService.current('user', 'incident')).rejects.toMatchObject({
    statusCode: 403,
  });
  await expect(incidentClosureService.close('user', 'incident', input)).rejects.toMatchObject({
    statusCode: 403,
  });
});
it('rejects inactive and missing accounts', async () => {
  mocks.actor.mockResolvedValue(null);
  await expect(incidentClosureService.current('user', 'incident')).rejects.toMatchObject({
    statusCode: 401,
  });
  mocks.actor.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
  await expect(incidentClosureService.close('user', 'incident', input)).rejects.toMatchObject({
    statusCode: 401,
  });
});
it('rejects missing incident and reads retained audit safely', async () => {
  mocks.incident.mockResolvedValue(null);
  await expect(incidentClosureService.current('user', 'incident')).rejects.toMatchObject({
    statusCode: 404,
  });
  mocks.incident.mockResolvedValue({
    status: 'CLOSED',
    updated_at: new Date(),
    closed_at: new Date(),
    incident_analysis: null,
  });
  mocks.record.mockResolvedValue({
    id: 'audit',
    occurred_at: new Date(),
    users: { id: 'officer', full_name: 'Officer' },
    after_data: { summary: input.summary, confirmed: true },
  });
  expect(await incidentClosureService.current('user', 'incident')).toMatchObject({
    canClose: false,
    closure: { summary: input.summary, closedBy: { name: 'Officer' } },
  });
});
it('passes closure to transactional repository', async () => {
  await incidentClosureService.close('user', 'incident', input);
  expect(mocks.close).toHaveBeenCalledWith('user', 'incident', input);
});
