import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  transaction: vi.fn(),
  query: vi.fn(),
  user: vi.fn(),
  updateUser: vi.fn(),
  session: vi.fn(),
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  method: vi.fn(),
  updateMethod: vi.fn(),
  consume: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    login_history: { create: mocks.history },
    $transaction: mocks.transaction,
    $queryRaw: mocks.query,
    users: { findUnique: mocks.user, update: mocks.updateUser },
    auth_sessions: {
      findFirst: mocks.session,
      create: mocks.createSession,
      update: mocks.revokeSession,
    },
    mfa_methods: {
      findUnique: mocks.method,
      update: mocks.updateMethod,
      updateMany: mocks.consume,
    },
  },
}));
import { prisma } from '../src/database/prisma.js';
import { authRepository } from '../src/modules/auth/auth.repository.js';

const userId = '22222222-2222-4222-8222-222222222222';
const user = {
  user_id: userId,
  email: 'user@example.test',
  status: 'active',
  deleted_at: null,
  locked_at: null,
  password_hash: 'verified-hash',
};
const login = {
  userId,
  passwordHash: user.password_hash,
  expectedLockVersion: null,
  refreshTokenHash: 'new-hash',
  expiresAt: new Date(Date.now() + 60000),
  ipAddress: null,
  userAgent: null,
};
const refresh = {
  tokenHash: 'old-hash',
  nextTokenHash: 'new-hash',
  expiresAt: login.expiresAt,
  ipAddress: null,
  userAgent: null,
};
const challenge = {
  mfaMethodId: 'method',
  tokenHash: 'challenge',
  expiresAt: login.expiresAt,
  ipAddress: null,
  expectedLockVersion: null,
  passwordHash: user.password_hash,
};

describe('account lock races at authentication database boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(
      (operation: (database: Prisma.TransactionClient) => Promise<unknown>) => operation(prisma),
    );
    mocks.query.mockResolvedValue([]);
    mocks.user.mockResolvedValue(user);
    mocks.session.mockResolvedValue({ user_id: userId, auth_session_id: 'session' });
    mocks.method.mockResolvedValue({ user_id: userId });
    mocks.consume.mockResolvedValue({ count: 0 });
  });

  it.each([
    { ...user, status: 'locked' },
    { ...user, deleted_at: new Date() },
    { ...user, locked_at: new Date() },
    { ...user, password_hash: 'changed-password' },
    null,
  ])(
    'rejects session and MFA challenge creation when the verified account changed: %j',
    async (changed) => {
      mocks.user.mockResolvedValue(changed);
      await expect(authRepository.createLoginSession(login)).resolves.toBeNull();
      await expect(authRepository.createMfaLoginChallenge(challenge)).resolves.toBe(false);
      expect(mocks.createSession).not.toHaveBeenCalled();
      expect(mocks.history).not.toHaveBeenCalled();
      expect(mocks.updateMethod).not.toHaveBeenCalled();
    },
  );

  it('issues a fresh session after unlock using the current lock version and holds the user row lock', async () => {
    const lockedAt = new Date();
    mocks.user.mockResolvedValue({ ...user, locked_at: lockedAt });
    await expect(
      authRepository.createLoginSession({ ...login, expectedLockVersion: lockedAt.toISOString() }),
    ).resolves.toMatchObject({ user_id: userId });
    expect(mocks.query.mock.calls[0]?.[1]).toBe(userId);
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.user.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.history).toHaveBeenCalledWith({
      data: {
        user_id: userId,
        email_attempted: 'user@example.test',
        success: true,
        ip_address: null,
        user_agent: null,
      },
      select: { login_history_id: true },
    });
  });

  it('records successful MFA login inside the session transaction', async () => {
    mocks.consume.mockResolvedValue({ count: 1 });
    mocks.updateUser.mockResolvedValue(user);
    await expect(
      authRepository.consumeMfaLoginChallenge({
        mfaMethodId: 'method',
        tokenHash: 'valid-challenge',
        refreshTokenHash: login.refreshTokenHash,
        sessionExpiresAt: login.expiresAt,
        ipAddress: '::1',
        userAgent: 'Test browser',
      }),
    ).resolves.toMatchObject({ kind: 'authenticated' });
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.history).toHaveBeenCalledWith({
      data: {
        user_id: userId,
        email_attempted: 'user@example.test',
        success: true,
        ip_address: '::1',
        user_agent: 'Test browser',
      },
      select: { login_history_id: true },
    });
  });

  it('does not return a login session when the history write fails', async () => {
    mocks.history.mockRejectedValue(new Error('History unavailable'));
    await expect(authRepository.createLoginSession(login)).rejects.toThrow('History unavailable');
  });

  it('rejects refresh when the account became locked before rotation', async () => {
    mocks.user.mockResolvedValue({ ...user, status: 'locked' });
    await expect(authRepository.rotateRefreshSession(refresh)).resolves.toBeNull();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('rejects the refresh token revoked by locking, even after the account is unlocked', async () => {
    mocks.session.mockResolvedValueOnce({ user_id: userId }).mockResolvedValueOnce(null);
    await expect(authRepository.rotateRefreshSession(refresh)).resolves.toBeNull();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('rejects an MFA challenge invalidated by locking before creating a session', async () => {
    await expect(
      authRepository.consumeMfaLoginChallenge({
        mfaMethodId: 'method',
        tokenHash: 'invalidated-challenge',
        refreshTokenHash: login.refreshTokenHash,
        sessionExpiresAt: login.expiresAt,
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toBeNull();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.consume.mock.invocationCallOrder[0] ?? Infinity,
    );
  });
});
