import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/access-control/access-control.repository.js', () => ({
  accessControlRepository: {
    findActor: vi.fn(),
    findUser: vi.fn(),
    countUsersByRole: vi.fn(),
    listRoleAssignments: vi.fn(),
    listUserOverrides: vi.fn(),
    replaceRolePermissions: vi.fn(),
    replaceUserOverrides: vi.fn(),
  },
}));

import { accessControlRepository } from '../src/modules/access-control/access-control.repository.js';
import { accessControlService } from '../src/modules/access-control/access-control.service.js';
import { permissionCatalog, roleIds } from '../src/modules/access-control/permission-catalog.js';

const actorUserId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';
const targetUserId = 'bc4fd619-9e78-45ea-8c67-f7f4fcb55df5';

describe('configure detailed permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accessControlRepository.findActor).mockResolvedValue({
      id: actorUserId,
      role: user_role.ADMIN,
      status: user_status.ACTIVE,
    });
    vi.mocked(accessControlRepository.countUsersByRole).mockResolvedValue(2);
    vi.mocked(accessControlRepository.listRoleAssignments).mockResolvedValue([]);
    vi.mocked(accessControlRepository.listUserOverrides).mockResolvedValue([]);
  });

  it('rejects changes to administrator permissions', async () => {
    await expect(
      accessControlService.configureRolePermissions(actorUserId, roleIds.ADMIN, {
        permissionIds: [],
        expectedUpdatedAt: new Date(0).toISOString(),
        reason: 'Attempt to remove administrator permissions.',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ADMIN_ROLE_IMMUTABLE' });
  });

  it('replaces a non-admin role permission set and reports affected users', async () => {
    const permission = permissionCatalog.find(({ code }) => code === 'assets.read');
    expect(permission).toBeDefined();
    vi.mocked(accessControlRepository.replaceRolePermissions).mockResolvedValue({
      updatedAt: new Date('2026-10-03T01:00:00.000Z'),
      affectedUserCount: 2,
    });
    vi.mocked(accessControlRepository.listRoleAssignments)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          scope_code: '__ROLE_CONFIGURATION__',
          effect: 'ALLOW',
          assigned_at: new Date('2026-10-03T01:00:00.000Z'),
        },
        {
          scope_code: 'assets.read',
          effect: 'ALLOW',
          assigned_at: new Date('2026-10-03T01:00:00.000Z'),
        },
      ]);
    const result = await accessControlService.configureRolePermissions(
      actorUserId,
      roleIds.EMPLOYEE,
      {
        permissionIds: [permission?.id ?? ''],
        expectedUpdatedAt: new Date(0).toISOString(),
        reason: 'Restrict employees to the asset directory.',
      },
    );
    expect(result).toMatchObject({ changed: true, affectedUserCount: 2 });
    expect(accessControlRepository.replaceRolePermissions).toHaveBeenCalledWith(
      expect.objectContaining({ role: user_role.EMPLOYEE, permissionCodes: ['assets.read'] }),
    );
  });

  it('rejects administrator-only permissions for a non-admin role', async () => {
    const permission = permissionCatalog.find(({ code }) => code === 'roles.update');
    expect(permission).toBeDefined();
    await expect(
      accessControlService.configureRolePermissions(actorUserId, roleIds.EMPLOYEE, {
        permissionIds: [permission?.id ?? ''],
        expectedUpdatedAt: new Date(0).toISOString(),
        reason: 'Attempt to elevate an employee account.',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ROLE_PERMISSION_NOT_ALLOWED' });
    expect(accessControlRepository.replaceRolePermissions).not.toHaveBeenCalled();
  });

  it('rejects administrator-only allow overrides for an employee', async () => {
    const permission = permissionCatalog.find(({ code }) => code === 'users.assign-role');
    expect(permission).toBeDefined();
    vi.mocked(accessControlRepository.findUser).mockResolvedValue({
      id: targetUserId,
      full_name: 'Employee User',
      email: 'employee@example.com',
      role: user_role.EMPLOYEE,
      status: user_status.ACTIVE,
    });
    await expect(
      accessControlService.configureUserPermissions(actorUserId, targetUserId, {
        allow: [permission?.id ?? ''],
        deny: [],
        reason: 'Attempt to elevate an employee account.',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ROLE_PERMISSION_NOT_ALLOWED' });
    expect(accessControlRepository.replaceUserOverrides).not.toHaveBeenCalled();
  });

  it('rejects per-user overrides for an administrator account', async () => {
    vi.mocked(accessControlRepository.findUser).mockResolvedValue({
      id: targetUserId,
      full_name: 'Admin User',
      email: 'admin@example.com',
      role: user_role.ADMIN,
      status: user_status.ACTIVE,
    });
    await expect(
      accessControlService.configureUserPermissions(actorUserId, targetUserId, {
        allow: [],
        deny: [],
        reason: 'Attempt to alter an administrator account.',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ADMIN_USER_IMMUTABLE' });
    expect(accessControlRepository.replaceUserOverrides).not.toHaveBeenCalled();
  });

  it('applies a user deny override before a role grant', async () => {
    vi.mocked(accessControlRepository.findUser).mockResolvedValue({
      id: targetUserId,
      full_name: 'Employee User',
      email: 'employee@example.com',
      role: user_role.EMPLOYEE,
      status: user_status.ACTIVE,
    });
    vi.mocked(accessControlRepository.listUserOverrides).mockResolvedValue([
      { scope_code: 'assets.read', effect: 'DENY', assigned_at: new Date(), expires_at: null },
    ]);
    await expect(accessControlService.hasPermission(targetUserId, 'assets.read')).resolves.toBe(
      false,
    );
  });
});
