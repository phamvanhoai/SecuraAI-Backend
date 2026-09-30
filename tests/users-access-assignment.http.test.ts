import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/user-management-authorization/users.service.js', () => ({
  usersService: {
    createUser: vi.fn(), getCurrentUser: vi.fn(), listUsers: vi.fn(), listDepartments: vi.fn(),
    getUser: vi.fn(), updateUser: vi.fn(), getUserAccessAssignment: vi.fn(),
    getUserAccessAssignmentOptions: vi.fn(), assignUserAccess: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { usersService } from '../src/modules/user-management-authorization/users.service.js';

const actorId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';
const userId = 'bc4fd619-9e78-45ea-8c67-f7f4fcb55df5';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', subject: actorId,
});

describe('user role, scope, and ownership HTTP routes', () => {
  const app = createApp();
  beforeEach(() => vi.clearAllMocks());

  it('loads bounded assignment options', async () => {
    vi.mocked(usersService.getUserAccessAssignmentOptions).mockResolvedValue({
      roles: [{ code: 'EMPLOYEE', name: 'Employee' }],
      scopeCodes: [
        { code: 'AUDIT_VIEW', name: 'View audit information' },
        { code: 'POLICY_APPROVE', name: 'Approve policies' },
      ],
      targetTypes: ['GLOBAL', 'BUSINESS_SERVICE', 'ASSET'],
      businessServices: [], assets: [],
    });
    const response = await request(app).get('/api/v1/users/access-assignment-options').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(usersService.getUserAccessAssignmentOptions).toHaveBeenCalledWith(actorId);
  });

  it('validates and replaces an assignment', async () => {
    vi.mocked(usersService.assignUserAccess).mockResolvedValue({
      changed: true, role: 'EXECUTIVE', scopeCount: 1,
    });
    const body = {
      role: 'EXECUTIVE', scopes: [{ scopeCode: 'AUDIT_VIEW', targetType: 'GLOBAL' }],
    };
    const response = await request(app).put(`/api/v1/users/${userId}/access-assignment`).set('Authorization', `Bearer ${token}`).send(body);
    expect(response.status).toBe(200);
    expect(usersService.assignUserAccess).toHaveBeenCalledWith(actorId, userId, body);
  });

  it('rejects a scope with the wrong target shape', async () => {
    const response = await request(app).put(`/api/v1/users/${userId}/access-assignment`).set('Authorization', `Bearer ${token}`).send({
      role: 'EMPLOYEE', scopes: [{ scopeCode: 'AUDIT_VIEW', targetType: 'ASSET' }],
    });
    expect(response.status).toBe(422);
    expect(usersService.assignUserAccess).not.toHaveBeenCalled();
  });
});
