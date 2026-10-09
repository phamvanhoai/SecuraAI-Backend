import { beforeEach, describe, expect, it, vi } from 'vitest';
import { user_role, user_status } from '@prisma/client';

const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = mocks.verifyIdToken;
  },
}));
vi.mock('../src/config/env.js', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_DAYS: 7,
  },
}));
vi.mock('../src/modules/authentication-account/auth.repository.js', () => ({
  authRepository: {
    findForGoogleLogin: vi.fn(),
    createGoogleSession: vi.fn(),
  },
}));

import { authRepository } from '../src/modules/authentication-account/auth.repository.js';
import { authService } from '../src/modules/authentication-account/auth.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';

describe('Google authentication service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links a verified Google subject to an existing active account', async () => {
    mocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'google-subject', email: 'USER@example.com', email_verified: true }),
    });
    vi.mocked(authRepository.findForGoogleLogin).mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      role: user_role.EXECUTIVE,
      status: user_status.ACTIVE,
      google_subject: null,
    });
    vi.mocked(authRepository.createGoogleSession).mockResolvedValue({
      id: userId,
      role: user_role.EXECUTIVE,
    });

    const result = await authService.loginWithGoogle({ credential: 'google-id-token' });

    expect(mocks.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: 'google-client-id.apps.googleusercontent.com',
    });
    expect(authRepository.createGoogleSession).toHaveBeenCalledWith(
      userId,
      'google-subject',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );
    expect(result.refreshToken).toHaveLength(64);
  });

  it('rejects unverified Google email claims without querying a user', async () => {
    mocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'google-subject', email: 'user@example.com', email_verified: false }),
    });

    await expect(
      authService.loginWithGoogle({ credential: 'google-id-token' }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_GOOGLE_CREDENTIAL' });
    expect(authRepository.findForGoogleLogin).not.toHaveBeenCalled();
  });
});
