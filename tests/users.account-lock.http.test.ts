import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findAccount: vi.fn(),
  countActiveManagers: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../src/modules/users/account-lock.repository.js', () => ({
  accountLockRepository: mocks,
}));

import { prisma } from '../src/database/prisma.js';
import { createApp } from '../src/app.js';
import { accountAccessRepository } from '../src/modules/auth/account-access.repository.js';
import { accountLockService } from '../src/modules/users/account-lock.service.js';
import {
  accountLockBodySchema,
  accountLockParamsSchema,
} from '../src/modules/users/dto/account-lock.dto.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const lockedAt = new Date('2026-09-17T01:00:00.123Z');
const account = (id: string, status: string, permissions: string[] = [], role = 'ADMIN') => ({
  user_id: id,
  status,
  locked_at: null,
  updated_at: lockedAt,
  user_roles_user_roles_user_idTousers: [
    {
      roles: {
        code: role,
        role_permissions: permissions.map((code) => ({ permissions: { code } })),
      },
    },
  ],
});
const token = (
  permissions = ['users.lock', 'users.unlock'],
  version?: string,
  roles = ['ADMIN'],
): string =>
  jwt.sign(
    {
      type: 'access',
      roles,
      permissions,
      ...(version ? { accountLockVersion: version } : {}),
    },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: actorId,
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );
const reason = { reason: 'Investigate suspicious account activity' };
const actor = { userId: actorId, roles: ['ADMIN'], permissions: ['users.lock', 'users.unlock'] };
const context = { ipAddress: null, userAgent: null };

describe('UC7 account lock/unlock validation and real service HTTP pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accountAccessRepository.findById).mockResolvedValue({
      status: 'active',
      deleted_at: null,
      locked_at: null,
    });
    mocks.transaction.mockImplementation(
      (_id: string, operation: (database: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(prisma),
    );
    mocks.findAccount.mockImplementation((_database: Prisma.TransactionClient, id: string) =>
      Promise.resolve(
        id === actorId
          ? account(actorId, 'active', actor.permissions)
          : account(targetId, 'active'),
      ),
    );
    mocks.countActiveManagers.mockResolvedValue(2);
    mocks.update.mockImplementation(
      (_database: Prisma.TransactionClient, input: { status: string }) =>
        Promise.resolve({
          user_id: targetId,
          status: input.status,
          locked_at: lockedAt,
          updated_at: lockedAt,
        }),
    );
  });

  it('validates UUIDs, normalizes reasons, and rejects unknown fields and reason boundaries', () => {
    expect(accountLockBodySchema.parse({ reason: `  ${reason.reason}  ` })).toEqual(reason);
    for (const body of [
      {},
      { reason: 'short' },
      { reason: ' '.repeat(20) },
      { reason: 'x'.repeat(1001) },
      { ...reason, status: 'active' },
    ])
      expect(accountLockBodySchema.safeParse(body).success).toBe(false);
    expect(accountLockParamsSchema.safeParse({ userId: 'bad-id' }).success).toBe(false);
  });

  it.each(['/api/v1/users', '/api/v1/admin/users'])(
    'locks through %s with stable response fields',
    async (prefix) => {
      const response = await request(createApp())
        .post(`${prefix}/${targetId}/lock`)
        .set('authorization', `Bearer ${token()}`)
        .send(reason);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: targetId,
          status: 'locked',
          changed: true,
          lastLockedAt: lockedAt.toISOString(),
        },
      });
      expect(mocks.update.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          userId: targetId,
          actorUserId: actorId,
          status: 'locked',
          ...reason,
        }),
      );
      expect(response.body.data.passwordHash).toBeUndefined();
    },
  );

  it('unlocks a locked account and retains the last lock timestamp', async () => {
    mocks.findAccount
      .mockResolvedValueOnce(account(actorId, 'active', actor.permissions))
      .mockResolvedValueOnce(account(targetId, 'locked'));
    const response = await request(createApp())
      .post(`/api/v1/users/${targetId}/unlock`)
      .set('authorization', `Bearer ${token()}`)
      .send(reason);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'active',
      changed: true,
      lastLockedAt: lockedAt.toISOString(),
    });
  });

  it('requires authentication and the operation-specific permission before mutation', async () => {
    const app = createApp();
    expect((await request(app).post(`/api/v1/users/${targetId}/lock`).send(reason)).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .post(`/api/v1/users/${targetId}/lock`)
          .set('authorization', `Bearer ${token(['users.unlock'])}`)
          .send(reason)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/users/${targetId}/unlock`)
          .set('authorization', `Bearer ${token(['users.lock'])}`)
          .send(reason)
      ).status,
    ).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    await expect(
      accountLockService.change(targetId, 'lock', reason, { ...actor, permissions: [] }, context),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects invalid input before opening a transaction', async () => {
    const app = createApp();
    for (const path of [`/api/v1/users/bad-id/lock`, `/api/v1/users/${targetId}/unlock`])
      expect(
        (
          await request(app)
            .post(path)
            .set('authorization', `Bearer ${token()}`)
            .send({ reason: 'short' })
        ).status,
      ).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(['lock', 'unlock'] as const)(
    'denies %s to non-admins even with both permissions',
    async (action) => {
      const response = await request(createApp())
        .post(`/api/v1/users/${targetId}/${action}`)
        .set('authorization', `Bearer ${token(actor.permissions, undefined, ['SECURITY_OFFICER'])}`)
        .send(reason);
      expect(response.status).toBe(403);
      expect(response.body.error.message).toBe(
        'Only administrators can lock or unlock user accounts',
      );
      await expect(
        accountLockService.change(
          targetId,
          action,
          reason,
          { ...actor, roles: ['SECURITY_OFFICER'] },
          context,
        ),
      ).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_REQUIRED' });
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a stale admin token when the live ADMIN role has been removed', async () => {
    mocks.findAccount.mockResolvedValueOnce(
      account(actorId, 'active', actor.permissions, 'SECURITY_OFFICER'),
    );
    await expect(
      accountLockService.change(targetId, 'lock', reason, actor, context),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('forbids self-management', async () => {
    await expect(
      accountLockService.change(actorId, 'lock', reason, actor, context),
    ).rejects.toMatchObject({ code: 'SELF_ACCOUNT_LOCK_FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(['inactive', 'disabled'])('does not reactivate %s accounts', async (status) => {
    mocks.findAccount
      .mockResolvedValueOnce(account(actorId, 'active', actor.permissions))
      .mockResolvedValueOnce(account(targetId, status));
    await expect(
      accountLockService.change(targetId, 'unlock', reason, actor, context),
    ).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_STATUS_CONFLICT' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 404 for missing/deleted accounts', async () => {
    mocks.findAccount
      .mockResolvedValueOnce(account(actorId, 'active', actor.permissions))
      .mockResolvedValueOnce(null);
    const response = await request(createApp())
      .post(`/api/v1/users/${targetId}/lock`)
      .set('authorization', `Bearer ${token()}`)
      .send(reason);
    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(['lock', 'unlock'] as const)('makes a repeated %s idempotent', async (action) => {
    const status = action === 'lock' ? 'locked' : 'active';
    mocks.findAccount
      .mockResolvedValueOnce(account(actorId, 'active', actor.permissions))
      .mockResolvedValueOnce(account(targetId, status));
    await expect(
      accountLockService.change(targetId, action, reason, actor, context),
    ).resolves.toMatchObject({ changed: false, status });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('protects the last active account manager', async () => {
    mocks.findAccount
      .mockResolvedValueOnce(account(actorId, 'active', ['users.lock']))
      .mockResolvedValueOnce(account(targetId, 'active', actor.permissions));
    mocks.countActiveManagers.mockResolvedValueOnce(1);
    await expect(
      accountLockService.change(targetId, 'lock', reason, actor, context),
    ).rejects.toMatchObject({ code: 'LAST_ACCOUNT_MANAGER' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(['revoked-permission', 'locked-actor'])(
    'rechecks %s inside the transaction',
    async (scenario) => {
      mocks.findAccount.mockResolvedValueOnce(
        account(actorId, scenario === 'locked-actor' ? 'locked' : 'active', []),
      );
      await expect(
        accountLockService.change(targetId, 'lock', reason, actor, context),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it.each(['locked', 'inactive', 'disabled', 'deleted', 'missing'])(
    'rejects an existing JWT for a %s account',
    async (status) => {
      vi.mocked(accountAccessRepository.findById).mockResolvedValue(
        status === 'missing'
          ? null
          : {
              status: status === 'deleted' ? 'active' : status,
              deleted_at: status === 'deleted' ? lockedAt : null,
              locked_at: lockedAt,
            },
      );
      expect(
        (
          await request(createApp())
            .post(`/api/v1/users/${targetId}/lock`)
            .set('authorization', `Bearer ${token()}`)
            .send(reason)
        ).status,
      ).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it('does not revive old JWTs after unlock but permits tokens from a fresh login', async () => {
    vi.mocked(accountAccessRepository.findById).mockResolvedValue({
      status: 'active',
      deleted_at: null,
      locked_at: lockedAt,
    });
    const app = createApp();
    expect(
      (
        await request(app)
          .post(`/api/v1/users/${targetId}/lock`)
          .set('authorization', `Bearer ${token()}`)
          .send(reason)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(`/api/v1/users/${targetId}/lock`)
          .set('authorization', `Bearer ${token(undefined, lockedAt.toISOString())}`)
          .send(reason)
      ).status,
    ).toBe(200);
  });

  it('documents both canonical and admin routes in Swagger', async () => {
    const response = await request(createApp()).get('/docs/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.paths['/users/{userId}/lock'].post.security).toEqual([{ bearerAuth: [] }]);
    expect(response.body.paths['/admin/users/{userId}/unlock'].post.responses['409']).toBeDefined();
  });
});
