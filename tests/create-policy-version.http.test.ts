import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  users: { findUnique: vi.fn() },
  policies: { findUnique: vi.fn(), update: vi.fn() },
  policy_versions: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  audit_logs: { create: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) },
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';
const versionId = 'ec178d52-2959-47fd-93db-aa693158668c';
const at = new Date('2026-10-30T00:00:00Z');
const policy = {
  id: policyId,
  policy_code: 'ISP-001',
  title: 'Security policy',
  description: null,
  owner_user_id: userId,
  status: 'ACTIVE',
  current_published_version_id: versionId,
  updated_at: at,
};
const input = {
  versionNumber: '2.0',
  content: 'Updated policy',
  changeSummary: 'Updated requirements',
};
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();
const send = (body: object = input) =>
  request(app)
    .post(`/api/v1/compliance/policies/${policyId}/versions`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

describe('create policy version through HTTP, service and repository', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.users.findUnique.mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    db.policies.findUnique.mockResolvedValue(policy);
    db.policies.update.mockResolvedValue(policy);
    db.policy_versions.findFirst.mockResolvedValueOnce({ id: versionId }).mockResolvedValue(null);
    db.policy_versions.findUnique.mockResolvedValue(null);
    db.policy_versions.create.mockResolvedValue({
      id: versionId,
      policy_id: policyId,
      version_number: '2.0',
      content: input.content,
      change_summary: input.changeSummary,
      status: 'DRAFT',
      author_user_id: userId,
      created_at: at,
    });
  });
  it('creates a draft, audits it, retains the current publication and does not copy acknowledgements', async () => {
    const result = await send();
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({
      policyId,
      policyStatus: 'active',
      version: { status: 'draft', versionNumber: '2.0', createdByUserId: userId },
    });
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.audit_logs.create).toHaveBeenCalledOnce();
    expect(db.policies.update).toHaveBeenCalledWith({
      where: { id: policyId },
      data: { updated_at: expect.any(Date) },
    });
  });
  it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE'])('forbids %s', async (role) => {
    db.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
    expect((await send()).status).toBe(403);
    expect(db.policy_versions.create).not.toHaveBeenCalled();
  });
  it('rechecks the role inside the transaction', async () => {
    db.users.findUnique
      .mockResolvedValueOnce({ role: 'SECURITY_OFFICER', status: 'ACTIVE' })
      .mockResolvedValue({ role: 'EXECUTIVE', status: 'ACTIVE' });
    expect((await send()).status).toBe(403);
    expect(db.policy_versions.create).not.toHaveBeenCalled();
  });
  it('requires an active account', async () => {
    db.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    expect((await send()).status).toBe(401);
  });
  it('requires policy ownership', async () => {
    db.policies.findUnique.mockResolvedValue({ ...policy, owner_user_id: versionId });
    expect((await send()).status).toBe(403);
    expect(db.policy_versions.create).not.toHaveBeenCalled();
  });
  it('returns 404 for a missing policy', async () => {
    db.policies.findUnique.mockResolvedValue(null);
    expect((await send()).status).toBe(404);
  });
  it.each(['DRAFT', 'ARCHIVED'])('blocks a %s policy', async (status) => {
    db.policies.findUnique.mockResolvedValue({ ...policy, status });
    expect((await send()).status).toBe(409);
  });
  it('blocks a missing current publication', async () => {
    db.policy_versions.findFirst.mockReset().mockResolvedValue(null);
    expect((await send()).status).toBe(409);
  });
  it('blocks an unfinished version after acquiring the lock', async () => {
    db.policy_versions.findFirst.mockReset().mockResolvedValue({ id: versionId });
    expect((await send()).body.error.code).toBe('POLICY_VERSION_IN_PROGRESS');
    expect(db.policy_versions.create).not.toHaveBeenCalled();
  });
  it('blocks a duplicate version number', async () => {
    db.policy_versions.findUnique.mockResolvedValue({ id: versionId });
    expect((await send()).body.error.code).toBe('POLICY_VERSION_EXISTS');
    expect(db.policy_versions.create).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, changeSummary: '' },
    { ...input, content: '' },
    { ...input, versionNumber: 'x'.repeat(31) },
    { ...input, status: 'PUBLISHED' },
  ])('validates the boundary', async (body) => {
    expect((await send(body)).status).toBe(422);
    expect(db.policy_versions.create).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    expect(
      (await request(app).post(`/api/v1/compliance/policies/${policyId}/versions`).send(input))
        .status,
    ).toBe(401);
  });
});
