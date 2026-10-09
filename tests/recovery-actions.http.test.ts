import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  findActor: vi.fn(),
  findById: vi.fn(),
  recordRecovery: vi.fn(),
  recoveryHistory: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/information-security-incident-management/incidents.repository.js', () => ({
  incidentsRepository: mocks,
}));
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
const endpoint = `/api/v1/incidents/${id}/recovery-actions`;
const app = createApp();
const input = {
  description: 'Restored affected service from verified backup and confirmed normal operation.',
  performedAt: '2026-01-01T00:00:00Z',
};
const action = {
  id,
  description: input.description,
  performed_at: new Date(input.performedAt),
  created_at: new Date(input.performedAt),
  users: { id, full_name: 'Officer' },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findActor.mockResolvedValue({ id, role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.findById.mockResolvedValue({ id, status: 'CLOSED' });
  mocks.recordRecovery.mockResolvedValue({ outcome: 'recorded', action });
  mocks.recoveryHistory.mockResolvedValue([1, [action]]);
});
it('records actor-owned recovery and exposes paginated history', async () => {
  const response = await request(app).post(endpoint).auth(token, { type: 'bearer' }).send(input);
  expect(response.status).toBe(201);
  expect(response.body.data).toMatchObject({
    phase: 'recovery',
    description: input.description,
    performedBy: { id, name: 'Officer' },
  });
  expect(mocks.recordRecovery).toHaveBeenCalledWith(id, id, input);
  const history = await request(app)
    .get(`${endpoint}?page=2&limit=5`)
    .auth(token, { type: 'bearer' });
  expect(history.status).toBe(200);
  expect(history.body.data.pagination).toEqual({ page: 2, limit: 5, total: 1, totalPages: 1 });
});
it('rejects completion flags on action recording; phase completion is separate', async () => {
  expect(
    (
      await request(app)
        .post(endpoint)
        .auth(token, { type: 'bearer' })
        .send({ ...input, recoveryCompleted: true })
    ).status,
  ).toBe(422);
  expect(mocks.recordRecovery).not.toHaveBeenCalled();
  expect(
    (
      await request(app)
        .post(endpoint)
        .auth(token, { type: 'bearer' })
        .send({ ...input, recoveryCompleted: 'yes' })
    ).status,
  ).toBe(422);
});
it.each(['ADMIN', 'EMPLOYEE', 'EXECUTIVE'])('rejects %s writes', async (role) => {
  mocks.findActor.mockResolvedValue({ id, role, status: 'ACTIVE' });
  expect(
    (await request(app).post(endpoint).auth(token, { type: 'bearer' }).send(input)).status,
  ).toBe(403);
  expect(mocks.recordRecovery).not.toHaveBeenCalled();
});
it('allows Executive history, including closed incidents', async () => {
  mocks.findActor.mockResolvedValue({ id, role: 'EXECUTIVE', status: 'ACTIVE' });
  expect((await request(app).get(endpoint).auth(token, { type: 'bearer' })).status).toBe(200);
});
it('requires authentication and active accounts', async () => {
  expect((await request(app).post(endpoint).send(input)).status).toBe(401);
  expect((await request(app).get(endpoint)).status).toBe(401);
  mocks.findActor.mockResolvedValue({ id, role: 'SECURITY_OFFICER', status: 'INACTIVE' });
  expect(
    (await request(app).post(endpoint).auth(token, { type: 'bearer' }).send(input)).status,
  ).toBe(401);
});
it.each([
  { ...input, description: 'short' },
  { ...input, description: 'x'.repeat(4001) },
  { ...input, performedAt: 'invalid' },
  { ...input, performedBy: id },
])('rejects invalid or spoofed input', async (body) => {
  expect(
    (await request(app).post(endpoint).auth(token, { type: 'bearer' }).send(body)).status,
  ).toBe(422);
  expect(mocks.recordRecovery).not.toHaveBeenCalled();
});
it.each([
  ['closed', 409],
  ['not_found', 404],
  ['forbidden', 403],
  ['future_time', 422],
] as const)('maps %s', async (outcome, status) => {
  mocks.recordRecovery.mockResolvedValue({ outcome });
  expect(
    (await request(app).post(endpoint).auth(token, { type: 'bearer' }).send(input)).status,
  ).toBe(status);
});
it('bounds pagination and handles missing incidents', async () => {
  expect(
    (await request(app).get(`${endpoint}?limit=101`).auth(token, { type: 'bearer' })).status,
  ).toBe(422);
  mocks.findById.mockResolvedValue(null);
  expect((await request(app).get(endpoint).auth(token, { type: 'bearer' })).status).toBe(404);
});
