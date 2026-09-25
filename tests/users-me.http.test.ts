import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { user_role, user_status } from '@prisma/client';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/user-management-authorization/users.repository.js', () => ({
  usersRepository: { findCurrentUser: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { usersRepository } from '../src/modules/user-management-authorization/users.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();

function accessToken(overrides: { type?: string; audience?: string; secret?: string } = {}): string {
  return jwt.sign(
    { type: overrides.type ?? 'access', role: 'ADMIN' },
    overrides.secret ?? env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      issuer: 'securaai-api',
      audience: overrides.audience ?? 'securaai-client',
      subject: userId,
      expiresIn: '15m',
    },
  );
}

describe('GET /api/v1/users/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns WBS-derived Admin capabilities without exposing password data', async () => {
    vi.mocked(usersRepository.findCurrentUser).mockResolvedValue({
      id: userId,
      email: 'admin@example.test',
      full_name: 'System Administrator',
      role: user_role.ADMIN,
      status: user_status.ACTIVE,
    });
    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        id: userId,
        email: 'admin@example.test',
        fullName: 'System Administrator',
        status: 'ACTIVE',
        mustChangePassword: false,
        mfaEnabled: false,
        roles: [{ code: 'ADMIN', name: 'ADMIN' }],
        permissions: [
          'users.read',
          'users.create',
          'users.update',
          'users.assign-role',
          'assets.classify',
          'policies.publish',
          'login-history.read',
          'log-sources.read',
          'integrations.read',
          'audit.read',
          'system-settings.read',
        ],
      },
    });
    expect(usersRepository.findCurrentUser).toHaveBeenCalledWith(userId);
  });

  it('rejects missing, wrong-type, wrong-audience and invalid-signature tokens', async () => {
    const headers = [
      undefined,
      `Bearer ${accessToken({ type: 'refresh' })}`,
      `Bearer ${accessToken({ audience: 'other-client' })}`,
      `Bearer ${accessToken({ secret: 'a-different-long-test-secret-value' })}`,
    ];
    for (const authorization of headers) {
      const pending = request(app).get('/api/v1/users/me');
      const response = await (authorization ? pending.set('Authorization', authorization) : pending);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    }
    expect(usersRepository.findCurrentUser).not.toHaveBeenCalled();
  });

  it('rejects an account that is no longer active', async () => {
    vi.mocked(usersRepository.findCurrentUser).mockResolvedValue({
      id: userId,
      email: 'admin@example.test',
      full_name: 'System Administrator',
      role: user_role.ADMIN,
      status: user_status.LOCKED,
    });
    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken()}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
