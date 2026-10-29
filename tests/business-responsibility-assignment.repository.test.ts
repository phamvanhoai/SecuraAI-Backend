import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  users: { findUnique: vi.fn(), update: vi.fn() },
  risks: { count: vi.fn() }, security_controls: { count: vi.fn() }, assets: { count: vi.fn() },
  business_services: { count: vi.fn() },
  user_access_scopes: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  auth_sessions: { updateMany: vi.fn() }, audit_logs: { create: vi.fn() }, $queryRaw: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: (callback: (tx: typeof mocks) => unknown) => callback(mocks) } }));
import { usersRepository } from '../src/modules/user-management-authorization/users.repository.js';
const actor = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.users.findUnique.mockResolvedValueOnce({ id: actor, role: 'ADMIN', status: 'ACTIVE' })
    .mockResolvedValueOnce({ id: user, role: 'EMPLOYEE', status: 'ACTIVE' });
  mocks.risks.count.mockResolvedValue(0); mocks.assets.count.mockResolvedValue(0);
  mocks.security_controls.count.mockResolvedValue(0); mocks.business_services.count.mockResolvedValue(0);
  mocks.user_access_scopes.findMany.mockResolvedValue([]);
  mocks.users.update.mockResolvedValue({ id: user, role: 'EMPLOYEE' });
});
describe('business responsibility assignment transaction', () => {
  it('blocks revocation and role changes while Risk records are owned', async () => {
    mocks.risks.count.mockResolvedValue(1);
    expect(await usersRepository.assignUserAccess(actor, user, { role: 'EMPLOYEE', scopes: [] }))
      .toEqual({ kind: 'ownership_transfer_required' });
    expect(mocks.user_access_scopes.deleteMany).not.toHaveBeenCalled();
    expect(mocks.users.update).not.toHaveBeenCalled();
  });
  it('persists an Employee grant and audits it without changing resource ownership', async () => {
    await usersRepository.assignUserAccess(actor, user, { role: 'EMPLOYEE', scopes: [{ scopeCode: 'RISK_OWNER', targetType: 'GLOBAL' }] });
    expect(mocks.user_access_scopes.createMany).toHaveBeenCalledWith({ data: [{ user_id: user, scope_code: 'RISK_OWNER', assigned_by: actor, expires_at: null }] });
    expect(mocks.audit_logs.create).toHaveBeenCalled();
    expect(mocks.$queryRaw).toHaveBeenCalled();
  });
  it('removes old unused permission entries when saving the new configuration', async () => {
    await usersRepository.assignUserAccess(actor, user, { role: 'EMPLOYEE', scopes: [] });
    expect(mocks.user_access_scopes.deleteMany).toHaveBeenCalledWith({ where: { user_id: user,
      scope_code: { in: ['RISK_OWNER', 'CONTROL_OWNER', 'ASSET_OWNER', 'AUTHORIZED_APPROVER', 'AUDIT_VIEW', 'POLICY_APPROVE'] } } });
  });
});
