import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ updatePhase: vi.fn(), phaseHistory: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/information-security-incident-management/incidents.service.js', () => ({
  incidentsService: mocks,
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';
const id = '00000000-0000-4000-8000-000000000010';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: id,
  expiresIn: '15m',
});
const endpoint = `/api/v1/incidents/${id}/progress`;
const app = createApp();
const input = {
  status: 'containment',
  expectedStatus: 'triage',
  expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
  confirmed: true,
  note: 'Triage complete; initial impact and response priority reviewed.',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.updatePhase.mockResolvedValue({ id, status: 'containment' });
  mocks.phaseHistory.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  });
});
it('protects writes and history with authentication', async () => {
  expect((await request(app).patch(endpoint).send(input)).status).toBe(401);
  expect((await request(app).get(endpoint)).status).toBe(401);
  expect(mocks.updatePhase).not.toHaveBeenCalled();
});
it('passes validated explicit confirmation and stale guards to the service', async () => {
  const response = await request(app).patch(endpoint).auth(token, { type: 'bearer' }).send(input);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ success: true, data: { id, status: 'containment' } });
  expect(mocks.updatePhase).toHaveBeenCalledWith(id, id, input);
});
it.each([
  { ...input, confirmed: false },
  { ...input, expectedUpdatedAt: undefined },
  { ...input, status: 'closed' },
  { ...input, actorId: id },
  { ...input, skipReason: 'short' },
])('rejects invalid input before workflow execution', async (body) => {
  expect(
    (await request(app).patch(endpoint).auth(token, { type: 'bearer' }).send(body)).status,
  ).toBe(422);
  expect(mocks.updatePhase).not.toHaveBeenCalled();
});
it.each([403, 404, 409, 422])('preserves workflow error %s', async (status) => {
  mocks.updatePhase.mockRejectedValue(
    new AppError(status, 'WORKFLOW_ERROR', 'Workflow cannot proceed'),
  );
  expect(
    (await request(app).patch(endpoint).auth(token, { type: 'bearer' }).send(input)).status,
  ).toBe(status);
});
it('validates history pagination and forwards it', async () => {
  expect(
    (await request(app).get(`${endpoint}?page=2&limit=5`).auth(token, { type: 'bearer' })).status,
  ).toBe(200);
  expect(mocks.phaseHistory).toHaveBeenCalledWith(id, id, { page: 2, limit: 5 });
  expect(
    (await request(app).get(`${endpoint}?limit=101`).auth(token, { type: 'bearer' })).status,
  ).toBe(422);
});
