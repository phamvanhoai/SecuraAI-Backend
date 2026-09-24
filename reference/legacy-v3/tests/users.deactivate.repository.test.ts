import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  userUpdate: vi.fn(),
  sessionsUpdate: vi.fn(),
  mfaUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));

import { accountDeactivationRepository } from '../src/modules/users/account-deactivation.repository.js';

const database = {
  $queryRaw: mocks.queryRaw,
  users: { update: mocks.userUpdate },
  auth_sessions: { updateMany: mocks.sessionsUpdate },
  mfa_methods: { updateMany: mocks.mfaUpdate },
  audit_logs: { create: mocks.auditCreate },
};

describe('account deactivation transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (client: typeof database) => Promise<unknown>) => callback(database));
    mocks.userUpdate.mockImplementation(async ({ data }: { data: { status?: string; deleted_at?: Date } }) => ({
      user_id: 'target-id', status: data.status ?? 'active',
      disabled_at: data.status ? new Date() : null,
      deleted_at: data.deleted_at ?? null, updated_at: new Date(),
    }));
  });

  it.each(['deactivate', 'remove'] as const)('%s revokes access and audits in one transaction', async (action) => {
    await accountDeactivationRepository.transaction('00000000-0000-4000-8000-000000000010',
      (client) => accountDeactivationRepository.change(client, {
        userId: 'target-id', actorUserId: 'actor-id', action,
        previousStatus: 'active', reason: 'Approved account lifecycle change',
        ipAddress: null, userAgent: null,
      }));
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining(action === 'deactivate'
        ? { status: 'disabled' } : { deleted_at: expect.any(Date) }),
    }));
    expect(mocks.sessionsUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: 'target-id', revoked_at: null },
    }));
    expect(mocks.mfaUpdate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: action === 'deactivate' ? 'user.deactivated' : 'user.removed' }),
    }));
  });
});
