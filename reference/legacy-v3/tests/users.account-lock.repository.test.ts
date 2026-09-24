import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  revoke: vi.fn(),
  cancelChallenge: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
    $queryRaw: mocks.query,
    users: { findFirst: mocks.findFirst, update: mocks.update, count: mocks.count },
    auth_sessions: { updateMany: mocks.revoke },
    mfa_methods: { updateMany: mocks.cancelChallenge },
    audit_logs: { create: mocks.audit },
  },
}));

import { prisma } from '../src/database/prisma.js';
import { accountLockRepository } from '../src/modules/users/account-lock.repository.js';

const userId = '22222222-2222-4222-8222-222222222222';
const input = {
  userId,
  actorUserId: '11111111-1111-4111-8111-111111111111',
  status: 'locked' as const,
  previousStatus: 'active',
  reason: 'Investigate suspicious activity',
  ipAddress: null,
  userAgent: null,
};

describe('UC7 transactional account repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      (operation: (database: Prisma.TransactionClient) => Promise<unknown>) => operation(prisma),
    );
    mocks.query.mockResolvedValue([]);
    mocks.update.mockResolvedValue({
      user_id: userId,
      status: 'locked',
      locked_at: new Date(),
      updated_at: new Date(),
    });
    mocks.revoke.mockResolvedValue({ count: 2 });
    mocks.cancelChallenge.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue({ audit_log_id: 'audit' });
  });

  it('serializes account management and takes the user row lock before invoking business rules', async () => {
    const operation = vi.fn().mockResolvedValue('result');
    await expect(accountLockRepository.transaction(userId, operation)).resolves.toBe('result');
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[0]?.[0].join('')).toContain('))::text');
    expect(mocks.query.mock.invocationCallOrder[1]).toBeLessThan(
      operation.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(mocks.query.mock.calls[1]?.[1]).toBe(userId);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('excludes deleted users and selects no credential fields', async () => {
    await accountLockRepository.findAccount(prisma, userId);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: userId, deleted_at: null } }),
    );
    expect(mocks.findFirst.mock.calls[0]?.[0].select.password_hash).toBeUndefined();
  });

  it('counts managers using active account state and both permissions', async () => {
    await accountLockRepository.countActiveManagers(prisma);
    expect(mocks.count.mock.calls[0]?.[0].where).toMatchObject({
      status: 'active',
      deleted_at: null,
      user_roles_user_roles_user_idTousers: { some: { roles: { code: 'ADMIN' } } },
      AND: expect.any(Array),
    });
    expect(JSON.stringify(mocks.count.mock.calls[0])).toContain('users.lock');
    expect(JSON.stringify(mocks.count.mock.calls[0])).toContain('users.unlock');
  });

  it('writes lock status, session revocations, challenge cancellation and a minimal audit in the same transaction', async () => {
    await accountLockRepository.transaction(userId, (database) =>
      accountLockRepository.update(database, input),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'locked',
          locked_at: expect.any(Date),
          updated_at: expect.any(Date),
        },
      }),
    );
    expect(mocks.revoke).toHaveBeenCalledWith({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
    expect(mocks.cancelChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: userId },
        data: {
          login_challenge_token_hash: null,
          login_challenge_expires_at: null,
          login_challenge_attempts: 0,
          login_challenge_ip: null,
          updated_at: expect.any(Date),
        },
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'user.locked',
          entity_id: userId,
          before_data: { status: 'active' },
          after_data: { status: 'locked', reason: input.reason },
        }),
      }),
    );
  });

  it('keeps the lock version and credentials intact when unlocking', async () => {
    await accountLockRepository.update(prisma, {
      ...input,
      status: 'active',
      previousStatus: 'locked',
    });
    expect(mocks.update.mock.calls[0]?.[0].data).toEqual({
      status: 'active',
      updated_at: expect.any(Date),
    });
    expect(mocks.audit.mock.calls[0]?.[0].data.action).toBe('user.unlocked');
  });

  it('propagates an audit failure out of the transaction so PostgreSQL can roll back', async () => {
    const error = new Error('Audit unavailable');
    mocks.audit.mockRejectedValueOnce(error);
    await expect(
      accountLockRepository.transaction(userId, (database) =>
        accountLockRepository.update(database, input),
      ),
    ).rejects.toBe(error);
  });
});
