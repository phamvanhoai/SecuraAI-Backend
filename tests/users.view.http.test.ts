import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock('../src/modules/users/users.repository.js', () => ({ usersRepository: mocks }));
vi.mock('../src/modules/auth/auth.email.service.js', () => ({
  authEmailService: { sendInitializedAccountEmail: vi.fn() },
}));

import { createApp } from '../src/app.js';

const userId = '00000000-0000-4000-8000-000000000010';
const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: ['ADMIN'], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

describe('view user HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({
      user_id: userId,
      email: 'analyst@example.com',
      full_name: 'Security Analyst',
      phone: null,
      employee_code: 'SEC-010',
      avatar_url: null,
      status: 'active',
      must_change_password: false,
      email_verified_at: null,
      last_login_at: null,
      disabled_at: null,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      updated_at: new Date('2026-09-19T01:00:00.000Z'),
      departments: null,
      user_roles_user_roles_user_idTousers: [],
    });
  });

  it('requires authentication and users.read permission', async () => {
    expect((await request(createApp()).get(`/api/v1/users/${userId}`)).status).toBe(401);
    expect(
      (
        await request(createApp())
          .get(`/api/v1/users/${userId}`)
          .set('authorization', `Bearer ${token([])}`)
      ).status,
    ).toBe(403);
  });

  it('validates the identifier before querying and returns user details', async () => {
    const invalid = await request(createApp())
      .get('/api/v1/users/not-a-uuid')
      .set('authorization', `Bearer ${token(['users.read'])}`);
    expect(invalid.status).toBe(422);
    expect(mocks.findById).not.toHaveBeenCalled();

    const response = await request(createApp())
      .get(`/api/v1/admin/users/${userId}`)
      .set('authorization', `Bearer ${token(['users.read'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: userId, email: 'analyst@example.com' },
    });
  });

  it('returns 404 when the user does not exist', async () => {
    mocks.findById.mockResolvedValue(null);
    const response = await request(createApp())
      .get(`/api/v1/users/${userId}`)
      .set('authorization', `Bearer ${token(['users.read'])}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
  });
});
