import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/user-management-authorization/users.service.js', () => ({
  usersService: { listDepartments: vi.fn() },
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

describe('GET /api/v1/users/departments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all active departments available to the Admin filter', async () => {
    vi.mocked(usersService.listDepartments).mockResolvedValue({
      departments: [
        {
          id: '773d8356-e68c-421b-9ce3-29ea4601970f',
          code: 'HR',
          name: 'Human Resources',
        },
      ],
    });

    const response = await request(app)
      .get('/api/v1/users/departments')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        departments: [
          {
            id: '773d8356-e68c-421b-9ce3-29ea4601970f',
            code: 'HR',
            name: 'Human Resources',
          },
        ],
      },
    });
    expect(usersService.listDepartments).toHaveBeenCalledWith(actorUserId);
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/users/departments');

    expect(response.status).toBe(401);
    expect(usersService.listDepartments).not.toHaveBeenCalled();
  });
});
