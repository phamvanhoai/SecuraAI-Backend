import { beforeEach, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  users: { findUnique: vi.fn(), update: vi.fn() },
  auth_sessions: { updateMany: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn((run: (db: typeof database) => Promise<unknown>) => run(database)),
  },
}));
import { authRepository } from '../src/modules/authentication-account/auth.repository.js';
import { prisma } from '../src/database/prisma.js';

beforeEach(() => {
  vi.clearAllMocks();
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
