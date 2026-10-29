import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  transactionActor: vi.fn(),
  create: vi.fn(),
  finding: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    users: { findUnique: mocks.actor },
    $transaction: (callback: (tx: object) => Promise<unknown>) =>
      callback({
        users: { findUnique: mocks.transactionActor },
        incidents: { create: mocks.create },
        security_findings: { findFirst: mocks.finding },
      }),
  },
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
const id = '00000000-0000-4000-8000-000000000010';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: id,
  expiresIn: '15m',
});
const app = createApp();
const manual = {
  sourceType: 'manual',
  title: 'Suspected endpoint compromise',
  description: 'Suspicious activity requires investigation by the security team.',
  severity: 'medium',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ id, role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.transactionActor.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
});
it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE'])(
  'denies active %s for every creation source without writes',
  async (role) => {
    mocks.actor.mockResolvedValue({ id, role, status: 'ACTIVE' });
    for (const sourceType of ['manual', 'alert', 'finding']) {
      const body = sourceType === 'manual' ? manual : { ...manual, sourceType, sourceId: id };
      const response = await request(app)
        .post('/api/v1/incidents')
        .auth(token, { type: 'bearer' })
        .send(body);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.finding).not.toHaveBeenCalled();
  },
);
it('rejects unauthenticated and inactive users', async () => {
  expect((await request(app).post('/api/v1/incidents').send(manual)).status).toBe(401);
  mocks.actor.mockResolvedValue({ id, role: 'SECURITY_OFFICER', status: 'INACTIVE' });
  expect(
    (await request(app).post('/api/v1/incidents').auth(token, { type: 'bearer' }).send(manual))
      .status,
  ).toBe(401);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE', 'INACTIVE'])(
  'rechecks permissions inside creation transaction after change to %s',
  async (state) => {
    mocks.transactionActor.mockResolvedValue({
      role: state === 'INACTIVE' ? 'SECURITY_OFFICER' : state,
      status: state === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
    const response = await request(app)
      .post('/api/v1/incidents')
      .auth(token, { type: 'bearer' })
      .send(manual);
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  },
);
it('allows an officer through the repository with server-owned creator and OPEN status', async () => {
  mocks.create.mockResolvedValue({
    id,
    incident_code: 'INC-TEST',
    title: manual.title,
    description: manual.description,
    severity: 'MEDIUM',
    status: 'OPEN',
    handler_user_id: null,
    detected_at: new Date(),
    confirmed_at: null,
    closed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    incident_analysis: null,
    users_incidents_created_byTousers: { id, full_name: 'Officer', email: 'officer@example.test' },
    users_incidents_handler_user_idTousers: null,
    security_findings: null,
    _count: {
      incident_actions: 0,
      incident_assets: 0,
      incident_controls: 0,
      incident_evidence: 0,
      incident_risks: 0,
    },
  });
  const response = await request(app)
    .post('/api/v1/incidents')
    .auth(token, { type: 'bearer' })
    .send(manual);
  expect(response.status).toBe(201);
  expect(response.body.data.status).toBe('open');
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        created_by: id,
        status: 'OPEN',
        title: manual.title,
        severity: 'MEDIUM',
      }),
    }),
  );
});
