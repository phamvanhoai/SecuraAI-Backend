import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
}));
vi.mock('../src/modules/authentication-account/auth.service.js', () => ({
  authService: { login: vi.fn(), refresh: vi.fn(), logout: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { authService } from '../src/modules/authentication-account/auth.service.js';

describe('V2 authentication HTTP routes', () => {
  const app = createApp();
  beforeEach(() => vi.clearAllMocks());

  it('returns the token envelope after validating login input', async () => {
    const data = { accessToken: 'access', refreshToken: 'r'.repeat(64), expiresIn: '900s' };
    vi.mocked(authService.login).mockResolvedValue(data);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ADMIN@example.test', password: 'CorrectPassword!' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data });
    expect(authService.login).toHaveBeenCalledWith({
      email: 'admin@example.test',
      password: 'CorrectPassword!',
    });
  });

  it('rejects invalid input before the service runs', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'x', unexpected: true });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('returns a rotated token pair and accepts idempotent logout', async () => {
    const data = { accessToken: 'next-access', refreshToken: 'n'.repeat(64), expiresIn: '900s' };
    vi.mocked(authService.refresh).mockResolvedValue(data);
    vi.mocked(authService.logout).mockResolvedValue();

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'r'.repeat(64) });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toEqual({ success: true, data });

    const loggedOut = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'r'.repeat(64) });
    expect(loggedOut.status).toBe(204);
    expect(authService.logout).toHaveBeenCalledWith('r'.repeat(64));
  });
});
