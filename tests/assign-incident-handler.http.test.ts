import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/information-security-incident-management/incidents.repository.js', () => ({
  incidentsRepository: { findActor: vi.fn(), assignmentOptions: vi.fn(), assignHandler: vi.fn() },
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';
import { incidentsService } from '../src/modules/information-security-incident-management/incidents.service.js';

const id = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const input = { assigneeUserId: id, note: 'Investigate the reported unauthorized access.' };
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: id,
  expiresIn: '15m',
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(incidentsRepository.findActor).mockResolvedValue({
    id,
    role: 'SECURITY_OFFICER',
    status: 'ACTIVE',
  });
  vi.mocked(incidentsRepository.assignmentOptions).mockResolvedValue([
    { id, full_name: 'Handler', email: 'handler@example.com' },
  ]);
});
describe('UC58 service and HTTP boundary', () => {
  it('returns the assigned incident and preserves its response phase', async () => {
    const at = new Date('2026-10-09T00:00:00Z');
    vi.mocked(incidentsRepository.assignHandler).mockResolvedValue({
      outcome: 'assigned',
      changed: true,
      assignedAt: at,
      incident: {
        id,
        incident_code: 'INC-TEST-001',
        incident_analysis: null,
        title: 'Suspicious access',
        description: 'Unexpected access',
        severity: 'MEDIUM',
        status: 'TRIAGE',
        handler_user_id: id,
        detected_at: null,
        confirmed_at: null,
        closed_at: null,
        created_at: at,
        updated_at: at,
        users_incidents_created_byTousers: {
          id,
          full_name: 'Officer',
          email: 'officer@example.test',
        },
        users_incidents_handler_user_idTousers: {
          id,
          full_name: 'Handler',
          email: 'handler@example.test',
        },
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
    const res = await request(app)
      .patch(`/api/v1/incidents/${id}/assignee`)
      .auth(token, { type: 'bearer' })
      .send(input);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      changed: true,
      status: 'triage',
      currentAssignment: { assignedAt: at.toISOString(), assignee: { id, name: 'Handler' } },
    });
  });
  it('lists eligible handlers using the FE contract', async () => {
    const res = await request(app)
      .get('/api/v1/incidents/assignment-options')
      .auth(token, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body.data.users).toEqual([{ id, name: 'Handler', email: 'handler@example.com' }]);
  });
  it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE'] as const)(
    'rejects %s for both endpoints',
    async (role) => {
      vi.mocked(incidentsRepository.findActor).mockResolvedValue({ id, role, status: 'ACTIVE' });
      expect(
        (
          await request(app)
            .get('/api/v1/incidents/assignment-options')
            .auth(token, { type: 'bearer' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .patch(`/api/v1/incidents/${id}/assignee`)
            .auth(token, { type: 'bearer' })
            .send(input)
        ).status,
      ).toBe(403);
      expect(incidentsRepository.assignHandler).not.toHaveBeenCalled();
    },
  );
  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/incidents/assignment-options')).status).toBe(401);
    expect((await request(app).patch(`/api/v1/incidents/${id}/assignee`).send(input)).status).toBe(
      401,
    );
  });
  it('rejects invalid body before repository access', async () => {
    expect(
      (
        await request(app)
          .patch(`/api/v1/incidents/${id}/assignee`)
          .auth(token, { type: 'bearer' })
          .send({ ...input, note: 'short' })
      ).status,
    ).toBe(422);
    expect(incidentsRepository.assignHandler).not.toHaveBeenCalled();
  });
  it.each([
    ['not_found', 404, 'INCIDENT_NOT_FOUND'],
    ['closed', 409, 'INCIDENT_CLOSED'],
    ['conflict', 409, 'INCIDENT_STALE'],
    ['invalid_handler', 409, 'INVALID_INCIDENT_HANDLER'],
    ['forbidden', 403, 'FORBIDDEN'],
  ] as const)('maps %s to actionable HTTP errors', async (outcome, status, code) => {
    vi.mocked(incidentsRepository.assignHandler).mockResolvedValue({ outcome });
    const res = await request(app)
      .patch(`/api/v1/incidents/${id}/assignee`)
      .auth(token, { type: 'bearer' })
      .send(input);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });
  it('does not allow inactive assigning officers', async () => {
    vi.mocked(incidentsRepository.findActor).mockResolvedValue({
      id,
      role: 'SECURITY_OFFICER',
      status: 'INACTIVE',
    });
    await expect(incidentsService.assignmentOptions(id)).rejects.toMatchObject({ statusCode: 401 });
  });
});
