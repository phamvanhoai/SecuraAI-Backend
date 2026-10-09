import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyIncidentSeveritySchema } from '../src/modules/information-security-incident-management/dto/classify-incident-severity.dto.js';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/information-security-incident-management/incidents.repository.js', () => ({
  incidentsRepository: {
    findActor: vi.fn(),
    classifySeverity: vi.fn(),
    classificationMetadata: vi.fn(),
    findById: vi.fn(),
    classificationHistory: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import {
  incidentsRepository,
  type IncidentViewRecord,
} from '../src/modules/information-security-incident-management/incidents.repository.js';
import { incidentsService } from '../src/modules/information-security-incident-management/incidents.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const incidentId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const at = new Date('2026-10-09T00:00:00Z');
const input = {
  severity: 'high' as const,
  rationale: 'Observed privileged access threatens the production business service.',
};
const incident: IncidentViewRecord = {
  id: incidentId,
  incident_code: 'INC-001',
  title: 'Suspicious login',
  description: 'Unexpected access',
  severity: 'HIGH',
  status: 'TRIAGE',
  handler_user_id: null,
  detected_at: at,
  confirmed_at: null,
  closed_at: null,
  created_at: at,
  updated_at: at,
  users_incidents_created_byTousers: {
    id: userId,
    full_name: 'Officer',
    email: 'officer@example.com',
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
};
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(incidentsRepository.findById).mockResolvedValue({
    ...incident,
    incident_assets: [],
    incident_actions: [],
  });
  vi.mocked(incidentsRepository.classificationHistory).mockResolvedValue([
    1,
    [
      {
        id: incidentId,
        occurred_at: at,
        before_data: { severity: 'medium' },
        after_data: input,
        users: { id: userId, full_name: 'Officer' },
      },
    ],
  ]);
  vi.mocked(incidentsRepository.findActor).mockResolvedValue({
    id: userId,
    role: 'SECURITY_OFFICER',
    status: 'ACTIVE',
  });
  vi.mocked(incidentsRepository.classificationMetadata).mockResolvedValue({
    counts: [{ resourceId: incidentId, count: 1 }],
    latest: [
      {
        resource_id: incidentId,
        occurred_at: at,
        after_data: input,
        users: { id: userId, full_name: 'Officer' },
      },
    ],
  });
  vi.mocked(incidentsRepository.classifySeverity).mockResolvedValue({
    outcome: 'classified',
    incident,
  });
});

describe('classification history', () => {
  it('returns paginated audit-backed transitions', async () => {
    const response = await request(app)
      .get(`/api/v1/incidents/${incidentId}/severity?page=2&limit=5`)
      .auth(token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      items: [
        {
          previousSeverity: 'medium',
          severity: 'high',
          rationale: input.rationale,
          classifiedBy: { name: 'Officer' },
        },
      ],
      pagination: { page: 2, limit: 5, total: 1, totalPages: 1 },
    });
    expect(incidentsRepository.classificationHistory).toHaveBeenCalledWith(incidentId, 2, 5);
  });
  it('allows Executive to read closed incident history', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EXECUTIVE',
      status: 'ACTIVE',
    });
    vi.mocked(incidentsRepository.findById).mockResolvedValue({
      ...incident,
      status: 'CLOSED',
      incident_assets: [],
      incident_actions: [],
    });
    expect(
      (await incidentsService.classificationHistory(userId, incidentId, { page: 1, limit: 10 }))
        .items,
    ).toHaveLength(1);
  });
  it('rejects unauthorized reads and invalid pagination', async () => {
    expect((await request(app).get(`/api/v1/incidents/${incidentId}/severity`)).status).toBe(401);
    expect(
      (
        await request(app)
          .get(`/api/v1/incidents/${incidentId}/severity?limit=101`)
          .auth(token, { type: 'bearer' })
      ).status,
    ).toBe(422);
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    await expect(
      incidentsService.classificationHistory(userId, incidentId, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(incidentsRepository.classificationHistory).not.toHaveBeenCalled();
  });
  it('returns not found or an empty history honestly', async () => {
    vi.mocked(incidentsRepository.classificationHistory).mockResolvedValue([0, []]);
    expect(
      await incidentsService.classificationHistory(userId, incidentId, { page: 1, limit: 10 }),
    ).toMatchObject({ items: [], pagination: { total: 0 } });
    vi.mocked(incidentsRepository.findById).mockResolvedValue(null);
    await expect(
      incidentsService.classificationHistory(userId, incidentId, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('incident severity DTO', () => {
  it('accepts the four severities and trims rationale', () => {
    for (const severity of ['low', 'medium', 'high', 'critical']) {
      expect(
        classifyIncidentSeveritySchema.parse({
          ...input,
          severity,
          rationale: ` ${input.rationale} `,
        }).rationale,
      ).toBe(input.rationale);
    }
  });
  it('rejects unsupported severity, short rationale and invalid revision', () => {
    for (const body of [
      { ...input, severity: 'urgent' },
      { ...input, rationale: 'short' },
      { ...input, expectedUpdatedAt: 'yesterday' },
    ]) {
      expect(classifyIncidentSeveritySchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('incident severity service and HTTP', () => {
  it('records classification and returns unchanged workflow status and its rationale', async () => {
    const response = await request(app)
      .patch(`/api/v1/incidents/${incidentId}/severity`)
      .auth(token, { type: 'bearer' })
      .send(input);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      severity: 'high',
      status: 'triage',
      classificationCount: 1,
      lastClassification: { rationale: input.rationale, classifiedBy: { name: 'Officer' } },
    });
    expect(incidentsRepository.classifySeverity).toHaveBeenCalledWith(userId, incidentId, input);
  });
  it('requires authentication and validates input before writes', async () => {
    expect(
      (await request(app).patch(`/api/v1/incidents/${incidentId}/severity`).send(input)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .patch(`/api/v1/incidents/${incidentId}/severity`)
          .auth(token, { type: 'bearer' })
          .send({ ...input, rationale: 'short' })
      ).status,
    ).toBe(422);
    expect(incidentsRepository.classifySeverity).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE'] as const)('denies %s', async (role) => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id: userId,
      role,
      status: 'ACTIVE',
    });
    await expect(
      incidentsService.classifySeverity(userId, incidentId, input),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(incidentsRepository.classifySeverity).not.toHaveBeenCalled();
  });
  it('denies an inactive officer', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue(null);
    await expect(
      incidentsService.classifySeverity(userId, incidentId, input),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
  it.each([
    ['not_found', 404, 'INCIDENT_NOT_FOUND'],
    ['closed', 409, 'INCIDENT_CLOSED'],
    ['conflict', 409, 'INCIDENT_STALE'],
    ['forbidden', 403, 'FORBIDDEN'],
  ] as const)('handles %s without a successful result', async (outcome, statusCode, code) => {
    vi.mocked(incidentsRepository.classifySeverity).mockResolvedValue({ outcome });
    await expect(
      incidentsService.classifySeverity(userId, incidentId, input),
    ).rejects.toMatchObject({ statusCode, code });
  });
});
