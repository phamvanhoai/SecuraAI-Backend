import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/user-management-authorization/users.service.js', () => ({
  usersService: { createUser: vi.fn(), getCurrentUser: vi.fn(), listUsers: vi.fn() },
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

describe('GET /api/v1/users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the paginated V2 user list', async () => {
    vi.mocked(usersService.listUsers).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      summary: { active: 0, inactive: 0, locked: 0, disabled: 0 },
    });
    const response = await request(app)
      .get('/api/v1/users?page=1&limit=20&roleCode=EXECUTIVE&status=active')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(usersService.listUsers).toHaveBeenCalledWith(actorUserId, {
      page: 1,
      limit: 20,
      roleCode: 'EXECUTIVE',
      status: 'ACTIVE',
    });
  });

  it('rejects unsupported legacy department filters', async () => {
    const response = await request(app)
      .get('/api/v1/users?departmentId=bd804acd-a5f7-4f4d-80e8-c0d53c219e31')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(usersService.listUsers).not.toHaveBeenCalled();
  });
});
