import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ assign: vi.fn(), listRoles: vi.fn() }));
vi.mock('../src/modules/users/user-role.repository.js', () => ({ userRoleRepository: mocks }));

import { createApp } from '../src/app.js';
import { userRoleService } from '../src/modules/users/user-role.service.js';

const userId = '00000000-0000-4000-8000-000000000010';
const actorId = '00000000-0000-4000-8000-000000000001';
const token = (roles = ['ADMIN'], permissions = ['users.assign-role']): string =>
  jwt.sign({ type: 'access', roles, permissions }, 'test-secret-with-at-least-thirty-two-characters', {
    algorithm: 'HS256', subject: actorId, issuer: 'securaai-api', audience: 'securaai-client', expiresIn: '15m',
  });

describe('assign user roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assign.mockResolvedValue({ kind: 'assigned', assignedRoleCodes: ['EMPLOYEE'] });
    mocks.listRoles.mockResolvedValue([{ code: 'EMPLOYEE', name: 'Employee', description: null, is_system: true }]);
  });

  it('requires authentication, ADMIN, and users.assign-role', async () => {
    const path = `/api/v1/users/${userId}/roles`;
    expect((await request(createApp()).post(path).send({ roleCodes: ['EMPLOYEE'] })).status).toBe(401);
    expect((await request(createApp()).post(path).set('authorization', `Bearer ${token(['ADMIN'], [])}`).send({ roleCodes: ['EMPLOYEE'] })).status).toBe(403);
    expect((await request(createApp()).post(path).set('authorization', `Bearer ${token(['EMPLOYEE'])}`).send({ roleCodes: ['EMPLOYEE'] })).status).toBe(403);
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('rejects empty or duplicate roles before mutation', async () => {
    for (const roleCodes of [[], ['EMPLOYEE', 'EMPLOYEE']]) {
      const response = await request(createApp()).post(`/api/v1/users/${userId}/roles`)
        .set('authorization', `Bearer ${token()}`).send({ roleCodes });
      expect(response.status).toBe(422);
    }
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('adds roles through the dedicated endpoint', async () => {
    const response = await request(createApp()).post(`/api/v1/users/${userId}/roles`)
      .set('authorization', `Bearer ${token()}`).send({ roleCodes: ['EMPLOYEE'] });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ changed: true, assignedRoleCodes: ['EMPLOYEE'] });
    expect(mocks.assign).toHaveBeenCalledWith(userId, actorId, { roleCodes: ['EMPLOYEE'] });
  });

  it('is idempotent for previously assigned roles', async () => {
    mocks.assign.mockResolvedValue({ kind: 'assigned', assignedRoleCodes: [] });
    await expect(userRoleService.assign(userId, { roleCodes: ['EMPLOYEE'] }, {
      userId: actorId, roles: ['ADMIN'], permissions: ['users.assign-role'],
    })).resolves.toEqual({ changed: false, assignedRoleCodes: [] });
  });

  it('maps missing, disabled, and unknown roles', async () => {
    const actor = { userId: actorId, roles: ['ADMIN'], permissions: ['users.assign-role'] };
    for (const [kind, statusCode] of [['not_found', 404], ['disabled', 409], ['invalid_roles', 422]] as const) {
      mocks.assign.mockResolvedValueOnce({ kind });
      await expect(userRoleService.assign(userId, { roleCodes: ['UNKNOWN'] }, actor))
        .rejects.toMatchObject({ statusCode });
    }
  });
});
