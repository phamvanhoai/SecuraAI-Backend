import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), queryRaw: vi.fn(), userFind: vi.fn(), roleFind: vi.fn(),
  createMany: vi.fn(), revokeSessions: vi.fn(), auditCreate: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: mocks.transaction } }));

import { userRoleRepository } from '../src/modules/users/user-role.repository.js';

const database = {
  $queryRaw: mocks.queryRaw,
  users: { findFirst: mocks.userFind },
  roles: { findMany: mocks.roleFind },
  user_roles: { createMany: mocks.createMany },
  auth_sessions: { updateMany: mocks.revokeSessions },
  audit_logs: { create: mocks.auditCreate },
};
const userId = '00000000-0000-4000-8000-000000000010';
const actorId = '00000000-0000-4000-8000-000000000001';

describe('user role assignment transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (client: typeof database) => Promise<unknown>) => callback(database));
    mocks.userFind.mockResolvedValue({ status: 'active', user_roles_user_roles_user_idTousers: [
      { role_id: 'existing-id', roles: { code: 'EMPLOYEE' } },
    ] });
    mocks.roleFind.mockResolvedValue([{ role_id: 'existing-id', code: 'EMPLOYEE' }, { role_id: 'new-id', code: 'AUDITOR' }]);
  });

  it('adds only missing roles, revokes refresh sessions and audits atomically', async () => {
    await expect(userRoleRepository.assign(userId, actorId, { roleCodes: ['EMPLOYEE', 'AUDITOR'] }))
      .resolves.toEqual({ kind: 'assigned', assignedRoleCodes: ['AUDITOR'] });
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [{ user_id: userId, role_id: 'new-id', assigned_by_user_id: actorId }], skipDuplicates: true });
    expect(mocks.revokeSessions).toHaveBeenCalledWith({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: expect.any(Date) } });
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.roles_assigned', actor_user_id: actorId }) }));
  });

  it('does not write or audit when all roles are already assigned', async () => {
    mocks.roleFind.mockResolvedValue([{ role_id: 'existing-id', code: 'EMPLOYEE' }]);
    await expect(userRoleRepository.assign(userId, actorId, { roleCodes: ['EMPLOYEE'] }))
      .resolves.toEqual({ kind: 'assigned', assignedRoleCodes: [] });
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.revokeSessions).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('rechecks the administrator permission inside the transaction', async () => {
    mocks.userFind.mockResolvedValueOnce({ status: 'active', user_roles_user_roles_user_idTousers: [] })
      .mockResolvedValueOnce(null);
    await expect(userRoleRepository.assign(userId, actorId, { roleCodes: ['AUDITOR'] }))
      .resolves.toEqual({ kind: 'forbidden' });
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
