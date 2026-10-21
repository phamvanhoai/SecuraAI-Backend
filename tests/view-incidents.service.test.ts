import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/information-security-incident-management/incidents.repository.js', () => ({
  incidentsRepository: {
    findActor: vi.fn(),
    list: vi.fn(),
    listCreatedBy: vi.fn(),
    findById: vi.fn(),
    classificationMetadata: vi.fn(),
  },
}));

import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';
import { incidentsService } from '../src/modules/information-security-incident-management/incidents.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const incidentId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const now = new Date('2026-09-30T00:00:00Z');
const record = {
  id: incidentId,
  incident_code: 'INC-2026-001',
  incident_analysis: null,
  title: 'Suspicious administrative login',
  description: 'An unexpected privileged login was detected.',
  severity: 'HIGH',
  status: 'TRIAGE' as const,
  handler_user_id: userId,
  detected_at: now,
  confirmed_at: now,
  closed_at: null,
  created_at: now,
  updated_at: now,
  users_incidents_created_byTousers: {
    id: userId,
    full_name: 'Security Officer',
    email: 'officer@example.com',
  },
  users_incidents_handler_user_idTousers: {
    id: userId,
    full_name: 'Security Officer',
    email: 'officer@example.com',
  },
  security_findings: null,
  incident_assets: [
    {
      linked_at: now,
      assets: {
        id: 'a1c8f72b-d6bc-45e3-b8f3-17e41ab7e128',
        asset_code: 'AST-001',
        name: 'Identity gateway',
        asset_type: 'Application',
        criticality: 'HIGH',
        status: 'ACTIVE' as const,
      },
      users: {
        id: userId,
        full_name: 'Security Officer',
        email: 'officer@example.com',
      },
    },
  ],
  incident_actions: [
    {
      id: '7ffaf9d3-51fb-4acc-b4d3-620017866123',
      phase: 'CONTAINMENT' as const,
      description: 'Disabled the affected privileged account.',
      performed_at: new Date('2026-09-30T01:00:00Z'),
      users: {
        id: userId,
        full_name: 'Security Officer',
        email: 'officer@example.com',
      },
    },
  ],
  _count: {
    incident_actions: 1,
    incident_assets: 2,
    incident_controls: 3,
    incident_evidence: 4,
    incident_risks: 1,
  },
};

describe('view incidents service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(incidentsRepository.classificationMetadata).mockResolvedValue({
      counts: [],
      latest: [],
    });
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
  });

  it('returns paginated V2 incidents', async () => {
    vi.mocked(incidentsRepository.list).mockResolvedValue([1, [record]]);
    const result = await incidentsService.list(userId, { page: 1, limit: 10 });
    expect(result).toMatchObject({
      items: [
        {
          incidentCode: 'INC-2026-001',
          severity: 'high',
          status: 'triage',
          hasAnalysis: false,
          currentAssignment: { assignee: { name: 'Security Officer' } },
          relatedCounts: { assets: 2, evidence: 4 },
        },
      ],
      pagination: { total: 1, totalPages: 1 },
    });
  });

  it('marks incidents with existing analysis for read-only discovery after reopening', async () => {
    vi.mocked(incidentsRepository.list).mockResolvedValue([
      1,
      [{ ...record, incident_analysis: { id: incidentId } }],
    ]);
    const result = await incidentsService.list(userId, { page: 1, limit: 10 });
    expect(result.items[0]).toMatchObject({ status: 'triage', hasAnalysis: true });
  });

  it('allows an Executive to view incident details', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EXECUTIVE',
      status: 'ACTIVE',
    });
    vi.mocked(incidentsRepository.findById).mockResolvedValue(record);
    await expect(incidentsService.detail(userId, incidentId)).resolves.toMatchObject({
      id: incidentId,
      createdBy: { name: 'Security Officer' },
      affectedAssets: [{ assetCode: 'AST-001', name: 'Identity gateway' }],
      responseActions: [
        {
          phase: 'containment',
          description: 'Disabled the affected privileged account.',
          performedBy: { name: 'Security Officer' },
        },
      ],
      handlingHistory: [
        { type: 'reported' },
        { type: 'confirmed' },
        { type: 'response_action', phase: 'containment' },
      ],
    });
  });

  it('allows an Employee to view an incident they reported', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    vi.mocked(incidentsRepository.findById).mockResolvedValue(record);

    await expect(incidentsService.detail(userId, incidentId)).resolves.toMatchObject({
      id: incidentId,
      incidentCode: 'INC-2026-001',
    });
  });

  it("prevents an Employee from viewing another reporter's incident", async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    vi.mocked(incidentsRepository.findById).mockResolvedValue({
      ...record,
      users_incidents_created_byTousers: {
        id: 'dc16fbad-1605-4a23-b31b-21f45de51ced',
        full_name: 'Another employee',
        email: 'another@example.com',
      },
    });

    await expect(incidentsService.detail(userId, incidentId)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('rejects roles outside the use case', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    await expect(incidentsService.list(userId, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('returns only incidents created by an active Employee', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    vi.mocked(incidentsRepository.listCreatedBy).mockResolvedValue([1, [record]]);

    const result = await incidentsService.listMine(userId, { page: 1, limit: 10 });

    expect(incidentsRepository.listCreatedBy).toHaveBeenCalledWith(userId, {
      page: 1,
      limit: 10,
    });
    expect(result).toMatchObject({
      items: [{ incidentCode: 'INC-2026-001' }],
      pagination: { total: 1, totalPages: 1 },
    });
  });

  it('rejects inactive users from their incident report list', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'INACTIVE',
    });

    await expect(incidentsService.listMine(userId, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(incidentsRepository.listCreatedBy).not.toHaveBeenCalled();
  });
});
