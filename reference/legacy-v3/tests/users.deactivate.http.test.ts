import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findAccount: vi.fn(),
  countActiveAdmins: vi.fn(),
  change: vi.fn(),
}));
vi.mock('../src/modules/users/account-deactivation.repository.js', () => ({
  accountDeactivationRepository: mocks,
}));
import { createApp } from '../src/app.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const token = (permissions: string[], roles = ['ADMIN']): string =>
  jwt.sign({ type: 'access', roles, permissions }, 'test-secret-with-at-least-thirty-two-characters', {
    algorithm: 'HS256', subject: actorId, issuer: 'securaai-api', audience: 'securaai-client', expiresIn: '15m',
  });
const account = (id: string, status: string, roles: string[]) => ({
  user_id: id, status, deleted_at: null, disabled_at: null,
  updated_at: new Date('2026-09-22T00:00:00Z'),
  user_roles_user_roles_user_idTousers: roles.map((code) => ({ roles: {
    code,
    role_permissions: [{ permissions: { code: 'users.deactivate' } }, { permissions: { code: 'users.remove' } }],
  } })),
});

describe('deactivate or remove user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (_id: string, callback: (database: object) => Promise<unknown>) => callback({}));
    mocks.findAccount.mockImplementation(async (_database: object, id: string) =>
      id === actorId ? account(actorId, 'active', ['ADMIN']) : account(targetId, 'active', ['EMPLOYEE']));
    mocks.countActiveAdmins.mockResolvedValue(2);
    mocks.change.mockImplementation(async (_database: object, input: { action: string }) => ({
      user_id: targetId, status: input.action === 'deactivate' ? 'disabled' : 'active',
      disabled_at: input.action === 'deactivate' ? new Date() : null,
      deleted_at: input.action === 'remove' ? new Date() : null,
      updated_at: new Date(),
    }));
  });

  it('requires authentication, ADMIN and the action permission', async () => {
    const path = `/api/v1/users/${targetId}/deactivate`;
    expect((await request(createApp()).post(path).send({ reason: 'Leaving company' })).status).toBe(401);
    expect((await request(createApp()).post(path).set('authorization', `Bearer ${token([])}`).send({ reason: 'Leaving company' })).status).toBe(403);
    expect((await request(createApp()).post(path).set('authorization', `Bearer ${token(['users.deactivate'], ['EMPLOYEE'])}`).send({ reason: 'Leaving company' })).status).toBe(403);
  });

  it('validates reason and deactivates through the admin alias', async () => {
    const path = `/api/v1/admin/users/${targetId}/deactivate`;
    expect((await request(createApp()).post(path).set('authorization', `Bearer ${token(['users.deactivate'])}`).send({ reason: 'short' })).status).toBe(422);
    const response = await request(createApp()).post(path)
      .set('authorization', `Bearer ${token(['users.deactivate'])}`)
      .send({ reason: 'Employee has left the company' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: targetId, status: 'disabled', changed: true });
    expect(mocks.change).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'deactivate', userId: targetId }));
  });

  it('soft-removes an account and refuses self-removal', async () => {
    const path = `/api/v1/users/${targetId}`;
    const response = await request(createApp()).delete(path)
      .set('authorization', `Bearer ${token(['users.remove'])}`)
      .send({ reason: 'Account removal approved by HR' });
    expect(response.status).toBe(200);
    expect(response.body.data.deletedAt).toBeTruthy();
    expect(mocks.change).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'remove' }));
    expect((await request(createApp()).delete(`/api/v1/users/${actorId}`)
      .set('authorization', `Bearer ${token(['users.remove'])}`)
      .send({ reason: 'Account removal approved by HR' })).status).toBe(403);
  });

  it('protects the last active administrator', async () => {
    mocks.findAccount.mockImplementation(async (_database: object, id: string) =>
      account(id, 'active', ['ADMIN']));
    mocks.countActiveAdmins.mockResolvedValue(1);
    const response = await request(createApp()).delete(`/api/v1/users/${targetId}`)
      .set('authorization', `Bearer ${token(['users.remove'])}`)
      .send({ reason: 'Account removal approved by HR' });
    expect(response.status).toBe(409);
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it('does not write another audit entry when already disabled', async () => {
    mocks.findAccount.mockImplementation(async (_database: object, id: string) =>
      id === actorId ? account(actorId, 'active', ['ADMIN']) : account(targetId, 'disabled', ['EMPLOYEE']));
    const response = await request(createApp()).post(`/api/v1/users/${targetId}/deactivate`)
      .set('authorization', `Bearer ${token(['users.deactivate'])}`)
      .send({ reason: 'Employee has left the company' });
    expect(response.status).toBe(200);
    expect(response.body.data.changed).toBe(false);
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it('returns 404 for an already removed account', async () => {
    mocks.findAccount.mockImplementation(async (_database: object, id: string) =>
      id === actorId ? account(actorId, 'active', ['ADMIN']) : null);
    const response = await request(createApp()).delete(`/api/v1/users/${targetId}`)
      .set('authorization', `Bearer ${token(['users.remove'])}`)
      .send({ reason: 'Account removal approved by HR' });
    expect(response.status).toBe(404);
    expect(mocks.change).not.toHaveBeenCalled();
  });
});
