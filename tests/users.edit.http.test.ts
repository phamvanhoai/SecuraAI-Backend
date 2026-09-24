import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ updateUser: vi.fn() }));

vi.mock('../src/modules/users/users.repository.js', () => ({ usersRepository: mocks }));
vi.mock('../src/modules/auth/auth.email.service.js', () => ({
  authEmailService: { sendInitializedAccountEmail: vi.fn() },
}));

import { createApp } from '../src/app.js';

const userId = '00000000-0000-4000-8000-000000000010';
const actorId = '00000000-0000-4000-8000-000000000001';
const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: ['ADMIN'], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: actorId,
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

const updatedUser = {
  user_id: userId,
  department_id: null,
  email: 'analyst@example.com',
  full_name: 'Updated Analyst',
  phone: '0901234567',
  employee_code: 'SEC-010',
  avatar_url: null,
  status: 'active',
  must_change_password: false,
  email_verified_at: null,
  last_login_at: null,
  disabled_at: null,
  created_at: new Date('2026-08-01T00:00:00.000Z'),
  updated_at: new Date('2026-09-21T01:00:00.000Z'),
  departments: null,
  user_roles_user_roles_user_idTousers: [
    {
      assigned_at: new Date('2026-08-01T00:00:00.000Z'),
      roles: {
        role_id: '00000000-0000-4000-8000-000000000020',
        code: 'EMPLOYEE',
        name: 'Employee',
        description: null,
      },
    },
  ],
};

describe('edit user HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateUser.mockResolvedValue({ kind: 'updated', user: updatedUser });
  });

  it('requires authentication and users.update permission', async () => {
    expect((await request(createApp()).patch(`/api/v1/users/${userId}`).send({})).status).toBe(401);
    expect(
      (
        await request(createApp())
          .patch(`/api/v1/users/${userId}`)
          .set('authorization', `Bearer ${token([])}`)
          .send({ fullName: 'Updated Analyst' })
      ).status,
    ).toBe(403);
  });

  it('validates and updates editable profile fields', async () => {
    const response = await request(createApp())
      .patch(`/api/v1/admin/users/${userId}`)
      .set('authorization', `Bearer ${token(['users.update'])}`)
      .send({
        fullName: ' Updated Analyst ',
        phone: '0901234567',
        employeeCode: 'SEC-010',
        departmentId: null,
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: userId,
      fullName: 'Updated Analyst',
      phone: '0901234567',
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      userId,
      actorUserId: actorId,
      body: {
        fullName: 'Updated Analyst',
        phone: '0901234567',
        employeeCode: 'SEC-010',
        departmentId: null,
      },
    });
  });

  it('rejects an empty body before accessing the repository', async () => {
    const response = await request(createApp())
      .patch(`/api/v1/users/${userId}`)
      .set('authorization', `Bearer ${token(['users.update'])}`)
      .send({});

    expect(response.status).toBe(422);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('rejects role changes through the profile endpoint', async () => {
    const response = await request(createApp())
      .patch(`/api/v1/users/${userId}`)
      .set('authorization', `Bearer ${token(['users.update'])}`)
      .send({ roleCodes: ['ADMIN'] });
    expect(response.status).toBe(422);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
