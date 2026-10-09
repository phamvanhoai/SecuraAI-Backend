import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  findActor: vi.fn(),
  findIncident: vi.fn(),
  save: vi.fn(),
  history: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock(
  '../src/modules/information-security-incident-management/incident-analysis.repository.js',
  () => ({ incidentAnalysisRepository: mocks }),
);
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
const id = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: id,
  expiresIn: '15m',
});
const url = `/api/v1/incidents/${id}/analysis`;
const app = createApp();
const findings = {
  rootCause: 'A privileged account bypassed the enforced authentication controls.',
  lessonsLearned: 'Review service-account exceptions during each access review.',
  improvementActions: 'Require MFA and remove unused privileged access within thirty days.',
};
const input = { ...findings, expectedUpdatedAt: null };
const record = {
  id,
  root_cause: findings.rootCause,
  lessons_learned: findings.lessonsLearned,
  improvement_actions: findings.improvementActions,
  analyzed_at: new Date('2026-01-01'),
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  users: { id, full_name: 'Officer' },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findActor.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.findIncident.mockResolvedValue({ status: 'LESSONS_LEARNED', incident_analysis: null });
  mocks.save.mockResolvedValue({ outcome: 'saved', analysis: record });
  mocks.history.mockResolvedValue([
    1,
    [
      {
        id,
        occurred_at: new Date('2026-01-01'),
        users: { id, full_name: 'Officer' },
        before_data: null,
        after_data: findings,
      },
    ],
  ]);
});
it('reads empty findings with capability and saves server-owned analyst', async () => {
  const current = await request(app).get(url).auth(token, { type: 'bearer' });
  expect(current.status).toBe(200);
  expect(current.body.data).toEqual({ analysis: null, canEdit: true, editRestriction: null });
  const saved = await request(app).patch(url).auth(token, { type: 'bearer' }).send(input);
  expect(saved.status).toBe(200);
  expect(saved.body.data).toMatchObject({ ...findings, analyzedBy: { id, name: 'Officer' } });
  expect(mocks.save).toHaveBeenCalledWith(id, id, input);
});
it.each(['ADMIN', 'EMPLOYEE', 'EXECUTIVE'])('denies %s writes', async (role) => {
  mocks.findActor.mockResolvedValue({ role, status: 'ACTIVE' });
  expect((await request(app).patch(url).auth(token, { type: 'bearer' }).send(input)).status).toBe(
    403,
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
it('allows Executive read but exposes no edit capability', async () => {
  mocks.findActor.mockResolvedValue({ role: 'EXECUTIVE', status: 'ACTIVE' });
  mocks.findIncident.mockResolvedValue({ status: 'CLOSED', incident_analysis: record });
  const res = await request(app).get(url).auth(token, { type: 'bearer' });
  expect(res.status).toBe(200);
  expect(res.body.data.canEdit).toBe(false);
  expect(
    (
      await request(app)
        .get(url + '/history')
        .auth(token, { type: 'bearer' })
    ).status,
  ).toBe(200);
});
it.each(['OPEN', 'TRIAGE', 'CONTAINMENT', 'ERADICATION', 'RECOVERY'])(
  'makes %s read-only',
  async (status) => {
    mocks.findIncident.mockResolvedValue({ status, incident_analysis: null });
    const res = await request(app).get(url).auth(token, { type: 'bearer' });
    expect(res.body.data.canEdit).toBe(false);
  },
);
it('requires authenticated active actor', async () => {
  expect((await request(app).get(url)).status).toBe(401);
  expect((await request(app).patch(url).send(input)).status).toBe(401);
  mocks.findActor.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
  expect((await request(app).get(url).auth(token, { type: 'bearer' })).status).toBe(401);
});
it.each([
  { ...input, rootCause: 'short' },
  { ...input, lessonsLearned: 'x'.repeat(4001) },
  { ...input, improvementActions: '   ' },
  { ...input, expectedUpdatedAt: 'invalid' },
  { ...input, analyzedBy: id },
  findings,
])('rejects invalid/spoofed body', async (body) => {
  expect((await request(app).patch(url).auth(token, { type: 'bearer' }).send(body)).status).toBe(
    422,
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each([
  ['forbidden', 403],
  ['not_found', 404],
  ['not_ready', 409],
  ['conflict', 409],
] as const)('maps %s', async (outcome, status) => {
  mocks.save.mockResolvedValue({ outcome });
  expect((await request(app).patch(url).auth(token, { type: 'bearer' }).send(input)).status).toBe(
    status,
  );
});
it('returns immutable history and bounded pagination', async () => {
  const res = await request(app)
    .get(url + '/history?page=2&limit=5')
    .auth(token, { type: 'bearer' });
  expect(res.status).toBe(200);
  expect(res.body.data.items[0]).toMatchObject({ findings, before: null });
  expect(mocks.history).toHaveBeenCalledWith(id, 2, 5);
  expect(
    (
      await request(app)
        .get(url + '/history?limit=101')
        .auth(token, { type: 'bearer' })
    ).status,
  ).toBe(422);
  mocks.findIncident.mockResolvedValue(null);
  expect((await request(app).get(url).auth(token, { type: 'bearer' })).status).toBe(404);
  expect(
    (
      await request(app)
        .get(url + '/history')
        .auth(token, { type: 'bearer' })
    ).status,
  ).toBe(404);
});
