import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  users: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  risks: { count: vi.fn() },
  security_controls: { count: vi.fn() },
  assets: { count: vi.fn() },
  business_services: { count: vi.fn() },
  user_access_scopes: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  auth_sessions: { updateMany: vi.fn() },
  audit_logs: { create: vi.fn(), findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: (callback: (tx: typeof mocks) => unknown) => callback(mocks) },
}));
import { usersRepository } from '../src/modules/user-management-authorization/users.repository.js';
const actor = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.audit_logs.findFirst.mockResolvedValue({ record_hash: 'previous-audit' });
  mocks.users.findUnique
    .mockResolvedValueOnce({ id: actor, role: 'ADMIN', status: 'ACTIVE' })
    .mockResolvedValueOnce({ id: user, role: 'EMPLOYEE', status: 'ACTIVE' });
  mocks.risks.count.mockResolvedValue(0);
  mocks.assets.count.mockResolvedValue(0);
  mocks.security_controls.count.mockResolvedValue(0);
  mocks.business_services.count.mockResolvedValue(0);
  mocks.user_access_scopes.findMany.mockResolvedValue([]);
  mocks.users.update.mockResolvedValue({ id: user, role: 'EMPLOYEE' });
});
describe('business responsibility assignment transaction', () => {
  it('blocks revocation and role changes while Risk records are owned', async () => {
    mocks.risks.count.mockResolvedValue(1);
    expect(
      await usersRepository.assignUserAccess(actor, user, { role: 'EMPLOYEE', scopes: [] }),
    ).toEqual({ kind: 'ownership_transfer_required' });
    expect(mocks.user_access_scopes.deleteMany).not.toHaveBeenCalled();
    expect(mocks.users.update).not.toHaveBeenCalled();
  });
  it('persists an Employee grant and audits it without changing resource ownership', async () => {
    await usersRepository.assignUserAccess(actor, user, {
      role: 'EMPLOYEE',
      scopes: [{ scopeCode: 'RISK_OWNER', targetType: 'GLOBAL' }],
    });
    expect(mocks.user_access_scopes.createMany).toHaveBeenCalledWith({
      data: [{ user_id: user, scope_code: 'RISK_OWNER', assigned_by: actor, expires_at: null }],
    });
    expect(mocks.audit_logs.create).toHaveBeenCalled();
    const audit = mocks.audit_logs.create.mock.calls[0]?.[0].data;
    expect(audit.previous_hash).toBe('previous-audit');
    expect(audit.record_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(createHash('sha256').update('previous-audit').digest('hex')).not.toBe(audit.record_hash);
    expect(mocks.$queryRaw).toHaveBeenCalled();
  });
  it('removes old unused permission entries when saving the new configuration', async () => {
    await usersRepository.assignUserAccess(actor, user, { role: 'EMPLOYEE', scopes: [] });
    expect(mocks.user_access_scopes.deleteMany).toHaveBeenCalledWith({
      where: {
        user_id: user,
        scope_code: {
          in: [
            'RISK_OWNER',
            'CONTROL_OWNER',
            'ASSET_OWNER',
            'AUTHORIZED_APPROVER',
            'AUDIT_VIEW',
            'POLICY_APPROVE',
          ],
        },
      },
    });
  });
});

describe('user provisioning transactions preserve append-only audit history', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.audit_logs.findFirst.mockResolvedValue({ record_hash: 'previous-audit' });
  });
  it('initially creates an inactive account and records provisioning rather than success', async () => {
    mocks.users.findUnique.mockResolvedValue({ id: actor, status: 'ACTIVE', role: 'ADMIN' });
    mocks.users.create.mockResolvedValue({
      id: user,
      email: 'new@example.com',
      role: 'EMPLOYEE',
      status: 'INACTIVE',
    });
    await usersRepository.createUser({
      actorUserId: actor,
      email: 'new@example.com',
      fullName: 'New User',
      username: 'new-user',
      passwordHash: 'secret-hash',
      role: 'EMPLOYEE',
    });
    expect(mocks.users.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'INACTIVE' }) }),
    );
    expect(mocks.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'USER_PROVISIONING_STARTED' }),
      }),
    );
    expect(JSON.stringify(mocks.audit_logs.create.mock.calls)).not.toContain('secret-hash');
  });
  it('activates only the same inactive provisioning attempt and audits success', async () => {
    mocks.users.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN', status: 'ACTIVE' })
      .mockResolvedValueOnce({
        id: user,
        email: 'new@example.com',
        username: 'new-user',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      });
    mocks.users.updateMany.mockResolvedValue({ count: 1 });
    await usersRepository.activateProvisionedUser(user, 'secret-hash', actor);
    expect(mocks.users.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: user, status: 'INACTIVE', password_hash: 'secret-hash' },
      }),
    );
    expect(mocks.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_CREATED',
          before_data: { status: 'INACTIVE' },
        }),
      }),
    );
  });
  it('removes the inactive account and appends failure without deleting any audit', async () => {
    mocks.users.deleteMany.mockResolvedValue({ count: 1 });
    expect(
      await usersRepository.deleteProvisionedUser(
        user,
        'secret-hash',
        actor,
        'EMAIL_DELIVERY_FAILED',
      ),
    ).toBe(true);
    expect(mocks.users.deleteMany).toHaveBeenCalledWith({
      where: { id: user, status: 'INACTIVE', password_hash: 'secret-hash' },
    });
    expect(mocks.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_CREATION_FAILED',
          outcome: 'FAILURE',
          error_code: 'EMAIL_DELIVERY_FAILED',
          after_data: { accountRemoved: true },
        }),
      }),
    );
    expect(JSON.stringify(mocks.audit_logs.create.mock.calls)).not.toContain('secret-hash');
  });
  it('does not delete an active or otherwise changed account', async () => {
    mocks.users.deleteMany.mockResolvedValue({ count: 0 });
    expect(
      await usersRepository.deleteProvisionedUser(
        user,
        'secret-hash',
        actor,
        'EMAIL_DELIVERY_FAILED',
      ),
    ).toBe(false);
    expect(mocks.audit_logs.create).not.toHaveBeenCalled();
  });
  it('propagates audit insertion failure to rollback cleanup', async () => {
    mocks.users.deleteMany.mockResolvedValue({ count: 1 });
    mocks.audit_logs.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(
      usersRepository.deleteProvisionedUser(user, 'secret-hash', actor, 'EMAIL_DELIVERY_FAILED'),
    ).rejects.toThrow('audit unavailable');
  });
});
