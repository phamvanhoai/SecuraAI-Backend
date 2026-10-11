import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/user-management-authorization/users.service.js', () => ({
  usersService: { createUser: vi.fn(), getCurrentUser: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { usersService } from '../src/modules/user-management-authorization/users.service.js';

const actorUserId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';
const app = createApp();
const token = jwt.sign({ type: 'access', role: 'ADMIN' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: actorUserId,
});

describe('POST /api/v1/users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates and creates an Executive account', async () => {
    vi.mocked(usersService.createUser).mockResolvedValue({
      id: 'bc4fd619-9e78-45ea-8c67-f7f4fcb55df5',
      email: 'new@example.com',
      username: 'new-12345678',
      fullName: 'New User',
      role: 'EXECUTIVE',
      status: 'ACTIVE',
      message: 'User account created. A temporary password was sent by email.',
    });
    const response = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'NEW@EXAMPLE.COM',
        fullName: ' New User ',
        role: 'EXECUTIVE',
      });
    expect(response.status).toBe(201);
    expect(usersService.createUser).toHaveBeenCalledWith(actorUserId, {
      email: 'new@example.com',
      fullName: 'New User',
      role: 'EXECUTIVE',
    });
  });

  it('rejects unsupported legacy and Admin role fields', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'new@example.com',
        fullName: 'New User',
        role: 'ADMIN',
        departmentId: actorUserId,
      });
    expect(response.status).toBe(422);
    expect(usersService.createUser).not.toHaveBeenCalled();
  });
});


