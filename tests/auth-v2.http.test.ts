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
import { AppError } from '../src/common/errors/app-error.js';

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
    }, expect.objectContaining({ ipAddress: expect.any(String) }));
  });

  it('returns the locked-account error in the standard error envelope', async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(
      new AppError(401, 'ACCOUNT_LOCKED', 'Account is LOCKED'),
    );

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'locked@example.test', password: 'CorrectPassword!' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'ACCOUNT_LOCKED', message: 'Account is LOCKED' },
    });
    expect(response.body).not.toHaveProperty('data');
  });

  it('returns the unknown-account error in the standard envelope', async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(
      new AppError(401, 'ACCOUNT_NOT_FOUND', 'Account does not exist'),
    );
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.test', password: 'CorrectPassword!' });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account does not exist' },
    });
    expect(response.body).not.toHaveProperty('data');
  });

  it('returns the inactive-account error in the standard envelope', async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(
      new AppError(401, 'ACCOUNT_INACTIVE', 'Account is INACTIVE'),
    );
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'inactive@example.test', password: 'CorrectPassword!' });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'ACCOUNT_INACTIVE', message: 'Account is INACTIVE' },
    });
    expect(response.body).not.toHaveProperty('data');
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
