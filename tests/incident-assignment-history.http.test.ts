import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  findActor: vi.fn(),
  findById: vi.fn(),
  assignmentHistory: vi.fn(),
  handlerNames: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/information-security-incident-management/incidents.repository.js', () => ({
  incidentsRepository: mocks,
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
const id = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const handlerId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: id,
  expiresIn: '15m',
});
const endpoint = `/api/v1/incidents/${id}/assignee`;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findActor.mockResolvedValue({ id, role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.findById.mockResolvedValue({ id, status: 'CLOSED' });
  mocks.assignmentHistory.mockResolvedValue([
    1,
    [
      {
        id,
        occurred_at: new Date('2026-10-09T00:00:00Z'),
        users: { id, full_name: 'Assigning Officer' },
        before_data: { assigneeUserId: null },
        after_data: { assigneeUserId: handlerId, note: 'Investigate production access.' },
      },
    ],
  ]);
  mocks.handlerNames.mockResolvedValue([{ id: handlerId, full_name: 'Handler' }]);
});
it('reads closed-incident assignment history and batches handler lookup', async () => {
  const res = await request(app).get(endpoint).auth(token, { type: 'bearer' });
  expect(res.status).toBe(200);
  expect(res.body.data.items[0]).toMatchObject({
    previousHandler: null,
    handler: { id: handlerId, name: 'Handler' },
    assignedBy: { id, name: 'Assigning Officer' },
    note: 'Investigate production access.',
  });
  expect(mocks.assignmentHistory).toHaveBeenCalledWith(id, 1, 10);
  expect(mocks.handlerNames).toHaveBeenCalledWith([handlerId]);
});
it('allows active Executives', async () => {
  mocks.findActor.mockResolvedValue({ id, role: 'EXECUTIVE', status: 'ACTIVE' });
  expect((await request(app).get(endpoint).auth(token, { type: 'bearer' })).status).toBe(200);
});
it.each(['ADMIN', 'EMPLOYEE'])('rejects %s', async (role) => {
  mocks.findActor.mockResolvedValue({ id, role, status: 'ACTIVE' });
  expect((await request(app).get(endpoint).auth(token, { type: 'bearer' })).status).toBe(403);
  expect(mocks.assignmentHistory).not.toHaveBeenCalled();
});
it('requires active authentication and validates bounded pagination', async () => {
  expect((await request(app).get(endpoint)).status).toBe(401);
  expect(
    (await request(app).get(`${endpoint}?page=0&limit=101`).auth(token, { type: 'bearer' })).status,
  ).toBe(422);
  mocks.findActor.mockResolvedValue({ id, role: 'SECURITY_OFFICER', status: 'INACTIVE' });
  expect((await request(app).get(endpoint).auth(token, { type: 'bearer' })).status).toBe(401);
});
it('returns missing incident error before history access', async () => {
  mocks.findById.mockResolvedValue(null);
  expect((await request(app).get(endpoint).auth(token, { type: 'bearer' })).status).toBe(404);
  expect(mocks.assignmentHistory).not.toHaveBeenCalled();
});
it('handles deleted users and malformed historical payloads safely', async () => {
  mocks.handlerNames.mockResolvedValue([]);
  let res = await request(app).get(endpoint).auth(token, { type: 'bearer' });
  expect(res.body.data.items[0].handler.name).toBe('Unknown handler');
  mocks.assignmentHistory.mockResolvedValue([
    1,
    [{ id, occurred_at: new Date(), users: null, before_data: {}, after_data: {} }],
  ]);
  res = await request(app).get(endpoint).auth(token, { type: 'bearer' });
  expect(res.body.data.items[0]).toMatchObject({ handler: null, assignedBy: null, note: null });
});
