import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), find: vi.fn() }));
vi.mock('./incident-management.repository.js', () => ({
  incidentManagementRepository: {
    createReport: mocks.create,
    listOwnReports: mocks.list,
    findOwnReport: mocks.find,
  },
}));
import { incidentManagementService } from './incident-management.service.js';
const input = {
  title: 'Suspicious email',
  description: 'The sender requested credentials through an unknown link.',
  category: 'phishing' as const,
};
describe('incident reporting service', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects callers without incidents.report', async () =>
    await expect(
      incidentManagementService.report(
        input,
        { userId: 'user-1', permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 }));
  it('creates a reported incident for the authenticated reporter', async () => {
    mocks.create.mockResolvedValue({
      incident_id: '11111111-1111-4111-8111-111111111111',
      incident_code: 'INC-20260917-ABC',
      title: input.title,
      description: input.description,
      category: input.category,
      severity: 'medium',
      status: 'reported',
      occurred_at: null,
      detected_at: new Date('2026-09-17T00:00:00Z'),
      created_at: new Date('2026-09-17T00:00:00Z'),
    });
    const result = await incidentManagementService.report(
      input,
      { userId: 'user-1', permissions: ['incidents.report'] },
      { ipAddress: null, userAgent: null },
    );
    expect(result.status).toBe('reported');
    expect(mocks.create).toHaveBeenCalledWith(
      input,
      'user-1',
      expect.stringMatching(/^INC-\d{8}-[A-F0-9]{8}$/),
      expect.any(Object),
    );
  });
  it('does not disclose another reporter incident', async () => {
    mocks.find.mockResolvedValue(null);
    await expect(
      incidentManagementService.getMine('11111111-1111-4111-8111-111111111111', {
        userId: 'user-1',
        permissions: ['incidents.report'],
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'INCIDENT_NOT_FOUND' });
  });
});
