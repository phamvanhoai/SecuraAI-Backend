import { requestContextStorage } from '../src/common/middleware/request-context.js';
import { beforeEach, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  audit_logs: { create: vi.fn(), findFirst: vi.fn() },
  users: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  auth_sessions: { updateMany: vi.fn(), findFirst: vi.fn() },
  password_reset_tokens: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn((run: (db: typeof database) => Promise<unknown>) => run(database)),
  },
}));
import { authRepository } from '../src/modules/authentication-account/auth.repository.js';
import { prisma } from '../src/database/prisma.js';

beforeEach(() => {
  vi.resetAllMocks();
  database.users.findUnique.mockResolvedValue({ status: 'ACTIVE', password_hash: 'old-hash' });
  database.users.update.mockResolvedValue({ id: 'user-id' });
  database.auth_sessions.updateMany.mockResolvedValue({ count: 2 });
});

it('updates the password and revokes every unrevoked session in the same transaction', async () => {
  expect(await authRepository.changePassword('user-id', 'old-hash', 'new-hash')).toBe(true);
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    maxWait: 30_000,
    timeout: 30_000,
  });
  expect(database.users.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        password_hash: 'new-hash',
        password_changed_at: expect.any(Date),
      }),
    }),
  );
  expect(database.auth_sessions.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { user_id: 'user-id', revoked_at: null },
    data: { revoked_at: expect.any(Date) },
  });
});

it('does not revoke sessions or overwrite a concurrently changed password', async () => {
  database.users.findUnique.mockResolvedValue({
    status: 'ACTIVE',
    password_hash: 'concurrent-hash',
  });
  expect(await authRepository.changePassword('user-id', 'old-hash', 'new-hash')).toBe(false);
  expect(database.users.update).not.toHaveBeenCalled();
  expect(database.auth_sessions.updateMany).not.toHaveBeenCalled();
});

it('fails the transaction when revocation fails instead of reporting a successful change', async () => {
  database.auth_sessions.updateMany.mockRejectedValueOnce(new Error('revocation failed'));
  await expect(authRepository.changePassword('user-id', 'old-hash', 'new-hash')).rejects.toThrow(
    'revocation failed',
  );
});

it('chains a SHA-256 audit without password or token data', async () => {
  database.audit_logs.findFirst.mockResolvedValue({ record_hash: 'previous-record' });
  await authRepository.changePassword('user-id', 'old-hash', 'new-hash');
  const audit = database.audit_logs.create.mock.calls[0]?.[0];
  expect(audit.data).toMatchObject({
    action: 'PASSWORD_CHANGED',
    actor_user_id: 'user-id',
    previous_hash: 'previous-record',
  });
  expect(audit.data.record_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(audit)).not.toContain('old-hash');
  expect(JSON.stringify(audit)).not.toContain('new-hash');
});
it('propagates audit failures so the password transaction cannot commit', async () => {
  database.audit_logs.create.mockRejectedValueOnce(new Error('audit failed'));
  await expect(authRepository.changePassword('user-id', 'old-hash', 'new-hash')).rejects.toThrow(
    'audit failed',
  );
});

it('audits logout once and does not log unknown or already revoked sessions', async () => {
  database.auth_sessions.findFirst.mockResolvedValue({ id: 'session-id', user_id: 'user-id' });
  database.auth_sessions.updateMany
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 0 });
  await authRepository.revokeSession('secret-token-hash');
  await authRepository.revokeSession('secret-token-hash');
  database.auth_sessions.findFirst.mockResolvedValue(null);
  await authRepository.revokeSession('unknown-token-hash');
  expect(database.audit_logs.create).toHaveBeenCalledTimes(1);
  expect(database.audit_logs.create.mock.calls[0]?.[0].data.action).toBe('USER_LOGGED_OUT');
  expect(JSON.stringify(database.audit_logs.create.mock.calls)).not.toContain('token-hash');
});
it('records reset requests and completion without exposing reset codes or password hashes', async () => {
  await authRepository.createPasswordResetToken({
    userId: 'user-id',
    tokenHash: 'secret-code-hash',
    expiresAt: new Date(),
  });
  database.password_reset_tokens.findUnique.mockResolvedValue({
    id: 'reset-id',
    user_id: 'user-id',
    expires_at: new Date(Date.now() + 60000),
    used_at: null,
  });
  database.password_reset_tokens.updateMany.mockResolvedValue({ count: 1 });
  database.users.updateMany = vi.fn().mockResolvedValue({ count: 1 });
  expect(
    await authRepository.consumePasswordResetToken('secret-code-hash', 'secret-password-hash'),
  ).toBe(true);
  expect(database.audit_logs.create.mock.calls.map((call) => call[0].data.action)).toEqual([
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_COMPLETED',
  ]);
  expect(JSON.stringify(database.audit_logs.create.mock.calls)).not.toContain('secret-');
});

it('captures request IP, user agent and correlation ID through the shared audit writer', async () => {
  await requestContextStorage.run(
    {
      sourceIp: '::ffff:192.0.2.10',
      userAgent: 'Audit integration test',
      correlationId: 'audit-request',
    },
    () => authRepository.changePassword('user-id', 'old-hash', 'new-hash'),
  );
  expect(database.audit_logs.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: 'PASSWORD_CHANGED',
        source_ip: '192.0.2.10',
        user_agent: 'Audit integration test',
        correlation_id: 'audit-request',
      }),
    }),
  );
});
