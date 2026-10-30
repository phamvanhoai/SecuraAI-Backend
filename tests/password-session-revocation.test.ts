import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../src/common/middleware/authenticate.js';
import { env } from '../src/config/env.js';
import { authRepository } from '../src/modules/authentication-account/auth.repository.js';

const userId = '00000000-0000-4000-8000-000000000001';
function token(version: number): string {
  return jwt.sign({ type: 'access', passwordVersion: version }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    issuer: 'securaai-api',
    audience: 'securaai-client',
    expiresIn: '15m',
  });
}

describe('password changes invalidate access on every device', () => {
  const app = express();
  app.get('/protected', authenticate, (_req, res) => {
    res.sendStatus(200);
  });
  beforeEach(() => vi.clearAllMocks());

  it('rejects both old access tokens and accepts a new login version, including changes in the same second', async () => {
    const firstDevice = token(0);
    const secondDevice = token(0);
    vi.mocked(authRepository.findAccessTokenUser).mockResolvedValue({
      status: 'ACTIVE',
      password_changed_at: null,
    });
    expect(
      (await request(app).get('/protected').auth(firstDevice, { type: 'bearer' })).status,
    ).toBe(200);
    expect(
      (await request(app).get('/protected').auth(secondDevice, { type: 'bearer' })).status,
    ).toBe(200);
    const changedAt = new Date();
    vi.mocked(authRepository.findAccessTokenUser).mockResolvedValue({
      status: 'ACTIVE',
      password_changed_at: changedAt,
    });
    expect(
      (await request(app).get('/protected').auth(firstDevice, { type: 'bearer' })).status,
    ).toBe(401);
    expect(
      (await request(app).get('/protected').auth(secondDevice, { type: 'bearer' })).status,
    ).toBe(401);
    expect(
      (await request(app).get('/protected').auth(token(changedAt.getTime()), { type: 'bearer' }))
        .status,
    ).toBe(200);
  });

  it('rejects missing accounts and unavailable account checks', async () => {
    vi.mocked(authRepository.findAccessTokenUser).mockResolvedValue(null);
    expect((await request(app).get('/protected').auth(token(0), { type: 'bearer' })).status).toBe(
      401,
    );
    vi.mocked(authRepository.findAccessTokenUser).mockRejectedValue(
      new Error('database unavailable'),
    );
    expect((await request(app).get('/protected').auth(token(0), { type: 'bearer' })).status).toBe(
      401,
    );
  });
});
