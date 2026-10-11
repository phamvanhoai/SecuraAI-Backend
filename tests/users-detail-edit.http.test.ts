import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/user-management-authorization/users.service.js', () => ({
  usersService: {
    createUser: vi.fn(),
    getCurrentUser: vi.fn(),
    getUser: vi.fn(),
    listUsers: vi.fn(),
    updateUser: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { usersService } from '../src/modules/user-management-authorization/users.service.js';

const actorUserId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';
const userId = 'bc4fd619-9e78-45ea-8c67-f7f4fcb55df5';
const token = jwt.sign({ type: 'access', role: 'ADMIN' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: actorUserId,
});
const detail = {
  id: userId,
  email: 'user@example.com',
  username: 'user-1234',
  fullName: 'User Example',
  phone: null,
  employeeCode: null,
  department: null,
  role: { code: 'EMPLOYEE' as const, name: 'EMPLOYEE' as const },
  status: 'ACTIVE' as const,
  googleConnected: false,
  lastLoginAt: null,
  passwordChangedAt: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-29T00:00:00.000Z'),
};

describe('V2 user details and editing HTTP routes', () => {
  const app = createApp();
  beforeEach(() => vi.clearAllMocks());

  it('returns user details', async () => {
    vi.mocked(usersService.getUser).mockResolvedValue(detail);
    const response = await request(app)
      .get(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: userId, googleConnected: false });
    expect(usersService.getUser).toHaveBeenCalledWith(actorUserId, userId);
  });

  it('updates only the validated V2 profile field', async () => {
    vi.mocked(usersService.updateUser).mockResolvedValue({ ...detail, fullName: 'Updated User' });
    const response = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Updated User',
        phone: null,
        employeeCode: null,
        departmentId: null,
        status: 'ACTIVE',
      });
    expect(response.status).toBe(200);
    expect(usersService.updateUser).toHaveBeenCalledWith(actorUserId, userId, {
      fullName: 'Updated User',
      phone: null,
      employeeCode: null,
      departmentId: null,
      status: 'ACTIVE',
    });
  });

  it('rejects legacy fields that do not exist in V2', async () => {
    const response = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Updated User', phone: '0123' });
    expect(response.status).toBe(422);
    expect(usersService.updateUser).not.toHaveBeenCalled();
  });
});
