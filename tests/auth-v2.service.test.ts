import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { user_role, user_status } from '@prisma/client';

vi.mock('../src/modules/authentication-account/auth.repository.js', () => ({
  authRepository: {
    findByEmail: vi.fn(),
    createSession: vi.fn(),
    rotateSession: vi.fn(),
    revokeSession: vi.fn(),
  },
}));

import { env } from '../src/config/env.js';
import { authRepository } from '../src/modules/authentication-account/auth.repository.js';
import { authService } from '../src/modules/authentication-account/auth.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const password = 'CorrectPassword!';

describe('V2 authentication service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issues scoped access claims and stores only a refresh-token hash', async () => {
    const passwordHash = await argon2.hash(password);
    vi.mocked(authRepository.findByEmail).mockResolvedValue({
      id: userId,
      email: 'admin@example.test',
      password_hash: passwordHash,
      role: user_role.ADMIN,
      status: user_status.ACTIVE,
    });
    vi.mocked(authRepository.createSession).mockResolvedValue({
      id: userId,
      role: user_role.ADMIN,
    });

    const result = await authService.login({ email: 'admin@example.test', password });

    expect(result.refreshToken.length).toBeGreaterThanOrEqual(32);
    expect(result.expiresIn).toBe('900s');
    expect(authRepository.createSession).toHaveBeenCalledWith(
      userId,
      passwordHash,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );
    expect(authRepository.createSession).not.toHaveBeenCalledWith(
      userId,
      passwordHash,
      result.refreshToken,
      expect.any(Date),
    );
    expect(
      jwt.verify(result.accessToken, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: 'securaai-api',
        audience: 'securaai-client',
      }),
    ).toMatchObject({ sub: userId, type: 'access', role: 'ADMIN' });
  });

  it('uses the same generic error for unknown, invalid, and inactive accounts', async () => {
    vi.mocked(authRepository.findByEmail).mockResolvedValueOnce(null);
    await expect(
      authService.login({ email: 'unknown@example.test', password }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });

    const passwordHash = await argon2.hash(password);
    vi.mocked(authRepository.findByEmail).mockResolvedValue({
      id: userId,
      email: 'admin@example.test',
      password_hash: passwordHash,
      role: user_role.ADMIN,
      status: user_status.LOCKED,
    });
    await expect(
      authService.login({ email: 'admin@example.test', password: 'wrong-password' }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    await expect(
      authService.login({ email: 'admin@example.test', password }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(authRepository.createSession).not.toHaveBeenCalled();
  });

  it('rotates refresh tokens and rejects a session that cannot be claimed', async () => {
    vi.mocked(authRepository.rotateSession).mockResolvedValueOnce({
      id: userId,
      role: user_role.ADMIN,
    });
    const result = await authService.refresh('a'.repeat(64));
    expect(result.refreshToken).not.toBe('a'.repeat(64));
    expect(authRepository.rotateSession).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );

    vi.mocked(authRepository.rotateSession).mockResolvedValueOnce(null);
    await expect(authService.refresh('a'.repeat(64))).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});
