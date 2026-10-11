import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ current: vi.fn(), close: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock(
  '../src/modules/information-security-incident-management/incident-closure.service.js',
  () => ({ incidentClosureService: mocks }),
);
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
const endpoint = `/api/v1/incidents/${id}/close`;
const app = createApp();
const input = {
  summary: 'Recovery verified and findings recorded.',
  confirmed: true,
  expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.close.mockResolvedValue({ changed: true, closedAt: input.expectedUpdatedAt });
  mocks.current.mockResolvedValue({ canClose: true });
});
it('requires authentication for closure and review', async () => {
  expect((await request(app).post(endpoint).send(input)).status).toBe(401);
  expect((await request(app).get(endpoint)).status).toBe(401);
});
it('forwards authenticated actor and validated closure', async () => {
  const response = await request(app).post(endpoint).auth(token, { type: 'bearer' }).send(input);
  expect(response.status).toBe(200);
  expect(response.body.data.changed).toBe(true);
  expect(mocks.close).toHaveBeenCalledWith(id, id, input);
  expect((await request(app).get(endpoint).auth(token, { type: 'bearer' })).status).toBe(200);
});
it.each([
  { ...input, confirmed: false },
  { ...input, expectedUpdatedAt: undefined },
  { ...input, summary: 'short' },
  { ...input, actorId: id },
])('rejects invalid input before service', async (body) => {
  expect(
    (await request(app).post(endpoint).auth(token, { type: 'bearer' }).send(body)).status,
  ).toBe(422);
  expect(mocks.close).not.toHaveBeenCalled();
});
it.each([403, 404, 409])('preserves workflow errors %s', async (status) => {
  mocks.close.mockRejectedValue(new AppError(status, 'WORKFLOW_ERROR', 'Cannot close'));
  expect(
    (await request(app).post(endpoint).auth(token, { type: 'bearer' }).send(input)).status,
  ).toBe(status);
});
