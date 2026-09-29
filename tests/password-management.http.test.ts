import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/authentication-account/auth.service.js', () => ({
  authService: {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
    changePassword: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { authService } from '../src/modules/authentication-account/auth.service.js';

const userId = '00000000-0000-4000-8000-000000000001';

function accessToken(): string {
  return jwt.sign({ type: 'access', role: 'EMPLOYEE' }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'securaai-api',
    audience: 'securaai-client',
    expiresIn: '15m',
  });
}

describe('V2 password management HTTP API', () => {
  const app = createApp();

  beforeEach(() => vi.clearAllMocks());

  it('accepts a normalized reset request without exposing account existence', async () => {
    const response = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'USER@EXAMPLE.COM' });

    expect(response.status).toBe(202);
    expect(response.body.data.message).toContain('If the account exists');
    expect(authService.requestPasswordReset).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  it('confirms a valid reset request and rejects malformed input', async () => {
    const valid = await request(app).post('/api/v1/auth/password-reset/confirm').send({
      token: '123456',
      newPassword: 'NewPassword!',
      confirmPassword: 'NewPassword!',
    });
    expect(valid.status).toBe(200);
    expect(authService.confirmPasswordReset).toHaveBeenCalledOnce();

    const invalid = await request(app).post('/api/v1/auth/password-reset/confirm').send({
      token: '12345',
      newPassword: 'weak',
      confirmPassword: 'different',
    });
    expect(invalid.status).toBe(422);
  });

  it('requires authentication and forwards the authenticated user for password changes', async () => {
    const body = {
      currentPassword: 'OldPassword!',
      newPassword: 'NewPassword!',
      confirmPassword: 'NewPassword!',
    };
    const unauthorized = await request(app).post('/api/v1/auth/change-password').send(body);
    expect(unauthorized.status).toBe(401);

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send(body);
    expect(changed.status).toBe(200);
    expect(authService.changePassword).toHaveBeenCalledWith(userId, body);
  });
});
