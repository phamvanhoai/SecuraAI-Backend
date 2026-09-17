import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  find: vi.fn(),
  queue: vi.fn(),
  classify: vi.fn(),
  options: vi.fn(),
  assign: vi.fn(),
  progress: vi.fn(),
}));
vi.mock('./incident-management.repository.js', () => ({
  incidentManagementRepository: {
    createReport: mocks.create,
    listOwnReports: mocks.list,
    findOwnReport: mocks.find,
    listClassificationQueue: mocks.queue,
    classifySeverity: mocks.classify,
    listAssignmentOptions: mocks.options,
    assignHandler: mocks.assign,
    updateProgress: mocks.progress,
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
  it('requires incidents.classify to classify severity', async () => {
    await expect(
      incidentManagementService.classify(
        '11111111-1111-4111-8111-111111111111',
        { severity: 'high', rationale: 'Confirmed impact to a production service.' },
        { userId: 'user-1', permissions: ['incidents.report'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('returns a classified incident', async () => {
    mocks.classify.mockResolvedValue({
      outcome: 'updated',
      incident: {
        incident_id: '11111111-1111-4111-8111-111111111111',
        incident_code: 'INC-001',
        title: 'Suspicious activity',
        description: 'A sufficiently detailed incident description.',
        category: 'other',
        severity: 'high',
        status: 'reported',
        occurred_at: null,
        detected_at: new Date('2026-09-17T00:00:00Z'),
        created_at: new Date('2026-09-17T00:00:00Z'),
      },
    });
    const result = await incidentManagementService.classify(
      '11111111-1111-4111-8111-111111111111',
      { severity: 'high', rationale: 'Confirmed impact to a production service.' },
      { userId: 'officer-1', permissions: ['incidents.classify'] },
      { ipAddress: null, userAgent: null },
    );
    expect(result.severity).toBe('high');
  });
  it('distinguishes a database default from a formal classification', async () => {
    mocks.queue.mockResolvedValue({
      items: [
        {
          incident_id: '11111111-1111-4111-8111-111111111111',
          incident_code: 'INC-001',
          title: 'Suspicious activity',
          description: 'A sufficiently detailed incident description.',
          category: 'other',
          severity: 'medium',
          status: 'reported',
          occurred_at: null,
          detected_at: new Date('2026-09-17T00:00:00Z'),
          created_at: new Date('2026-09-17T00:00:00Z'),
        },
      ],
      total: 1,
      classificationAudits: [],
      assignments: [],
    });
    const result = await incidentManagementService.listForClassification(
      { page: 1, limit: 10 },
      { userId: 'officer-1', permissions: ['incidents.classify'] },
    );
    expect(result.items[0]).toMatchObject({
      severity: 'medium',
      classified: false,
      classificationCount: 0,
      lastClassification: null,
    });
  });
  it('requires incidents.assign to assign a handler', async () => {
    await expect(
      incidentManagementService.assign(
        '11111111-1111-4111-8111-111111111111',
        {
          assigneeUserId: '22222222-2222-4222-8222-222222222222',
          note: 'Assign to the officer responsible for endpoint response.',
        },
        { userId: 'officer-1', permissions: ['incidents.classify'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('returns the active handler after assignment', async () => {
    mocks.assign.mockResolvedValue({
      outcome: 'assigned',
      incident: {
        incident_id: '11111111-1111-4111-8111-111111111111',
        incident_code: 'INC-001',
        title: 'Suspicious activity',
        description: 'A sufficiently detailed incident description.',
        category: 'other',
        severity: 'high',
        status: 'assigned',
        occurred_at: null,
        detected_at: new Date('2026-09-17T00:00:00Z'),
        created_at: new Date('2026-09-17T00:00:00Z'),
      },
      assignee: {
        user_id: '22222222-2222-4222-8222-222222222222',
        full_name: 'Security Officer',
        email: 'officer@example.com',
      },
      assignedAt: new Date('2026-09-17T01:00:00Z'),
    });
    const result = await incidentManagementService.assign(
      '11111111-1111-4111-8111-111111111111',
      {
        assigneeUserId: '22222222-2222-4222-8222-222222222222',
        note: 'Assign to the officer responsible for endpoint response.',
      },
      { userId: 'officer-1', permissions: ['incidents.assign'] },
      { ipAddress: null, userAgent: null },
    );
    expect(result).toMatchObject({
      status: 'assigned',
      currentAssignment: { assignee: { name: 'Security Officer' } },
    });
  });
  it('requires incidents.update-progress to update handling status', async () => {
    await expect(
      incidentManagementService.updateProgress(
        '11111111-1111-4111-8111-111111111111',
        { status: 'in_progress', note: 'Investigation has started with endpoint log collection.' },
        { userId: 'officer-1', permissions: ['incidents.assign'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('returns the updated handling status', async () => {
    mocks.progress.mockResolvedValue({
      outcome: 'updated',
      incident: {
        incident_id: '11111111-1111-4111-8111-111111111111',
        incident_code: 'INC-001',
        title: 'Suspicious activity',
        description: 'A sufficiently detailed incident description.',
        category: 'other',
        severity: 'high',
        status: 'in_progress',
        occurred_at: null,
        detected_at: new Date('2026-09-17T00:00:00Z'),
        created_at: new Date('2026-09-17T00:00:00Z'),
      },
    });
    const result = await incidentManagementService.updateProgress(
      '11111111-1111-4111-8111-111111111111',
      { status: 'in_progress', note: 'Investigation has started with endpoint log collection.' },
      { userId: 'officer-1', permissions: ['incidents.update-progress'] },
      { ipAddress: null, userAgent: null },
    );
    expect(result.status).toBe('in_progress');
    expect(mocks.progress).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.any(Object),
      'officer-1',
      false,
      expect.any(Object),
    );
  });
  it('allows an incident coordinator override and rejects an unrelated officer', async () => {
    mocks.progress.mockResolvedValueOnce({ outcome: 'not_handler' });
    await expect(
      incidentManagementService.updateProgress(
        '11111111-1111-4111-8111-111111111111',
        { status: 'escalated', note: 'Escalating because the incident affects multiple services.' },
        { userId: 'officer-2', permissions: ['incidents.update-progress'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_INCIDENT_HANDLER' });
    mocks.progress.mockResolvedValueOnce({ outcome: 'invalid_transition' });
    await expect(
      incidentManagementService.updateProgress(
        '11111111-1111-4111-8111-111111111111',
        { status: 'escalated', note: 'Escalating because the incident affects multiple services.' },
        {
          userId: 'coordinator-1',
          permissions: ['incidents.update-progress', 'incidents.assign'],
        },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    expect(mocks.progress).toHaveBeenLastCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.any(Object),
      'coordinator-1',
      true,
      expect.any(Object),
    );
  });
});
