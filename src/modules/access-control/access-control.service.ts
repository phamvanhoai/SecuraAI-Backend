import type { user_role } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { accessControlRepository } from './access-control.repository.js';
import type { ListPermissionsQuery } from './dto/permission.dto.js';
import type {
  ConfigureRolePermissionsBody,
  ConfigureUserPermissionsBody,
  ListRolesQuery,
} from './dto/role-permissions.dto.js';
import {
  defaultPermissionsForRole,
  fixedRoleNames,
  isPermissionCode,
  permissionCatalog,
  permissionCodeFromId,
  roleConfigurationMarker,
  roleIds,
} from './permission-catalog.js';
import { canRoleReceivePermission } from './permission-policy.js';

const roles = Object.keys(fixedRoleNames) as user_role[];
const epoch = new Date(0);

async function requireAdmin(actorUserId: string): Promise<void> {
  const actor = await accessControlRepository.findActor(actorUserId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'ADMIN') {
    throw new AppError(403, 'ADMIN_REQUIRED', 'Only administrators can configure permissions');
  }
}

function roleFromId(roleId: string): user_role | undefined {
  return roles.find((role) => roleIds[role] === roleId);
}

function codesFromIds(ids: readonly string[]): string[] {
  const codes = ids.map(permissionCodeFromId);
  if (codes.some((code) => code === undefined)) {
    throw new AppError(422, 'INVALID_PERMISSIONS', 'One or more permissions do not exist');
  }
  return codes.filter((code): code is string => code !== undefined);
}

async function roleState(role: user_role) {
  const [rows, assignedUserCount] = await Promise.all([
    accessControlRepository.listRoleAssignments(role),
    accessControlRepository.countUsersByRole(role),
  ]);
  const configured = rows.some(({ scope_code }) => scope_code === roleConfigurationMarker);
  const permissionCodes = configured
    ? rows
        .filter(
          ({ scope_code, effect }) => scope_code !== roleConfigurationMarker && effect === 'ALLOW',
        )
        .map(({ scope_code }) => scope_code)
        .filter(isPermissionCode)
    : [...defaultPermissionsForRole(role)];
  const updatedAt = rows[0]?.assigned_at ?? epoch;
  return { permissionCodes: [...new Set(permissionCodes)].sort(), updatedAt, assignedUserCount };
}

function permissionResponse(code: string) {
  const permission = permissionCatalog.find((item) => item.code === code);
  if (!permission)
    throw new AppError(500, 'PERMISSION_CATALOG_ERROR', 'Permission catalog is invalid');
  return permission;
}

async function roleResponse(role: user_role) {
  const state = await roleState(role);
  return {
    id: roleIds[role],
    code: role,
    name: fixedRoleNames[role],
    description: `Fixed SecuraAI ${fixedRoleNames[role]} role.`,
    isSystem: true,
    permissions: state.permissionCodes.map(permissionResponse),
    assignedUserCount: state.assignedUserCount,
    workflowStepCount: 0,
    createdAt: epoch,
    updatedAt: state.updatedAt,
  };
}

export const accessControlService = {
  async listPermissions(actorUserId: string, query: ListPermissionsQuery) {
    await requireAdmin(actorUserId);
    const search = query.search?.toLocaleLowerCase();
    const filtered = permissionCatalog.filter(
      (item) =>
        (!query.module || item.module === query.module) &&
        (!search ||
          item.code.toLocaleLowerCase().includes(search) ||
          item.description.toLocaleLowerCase().includes(search)),
    );
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort(
      (left, right) => left[query.sortBy].localeCompare(right[query.sortBy]) * direction,
    );
    const start = (query.page - 1) * query.limit;
    return {
      items: sorted.slice(start, start + query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: sorted.length,
        totalPages: Math.ceil(sorted.length / query.limit),
      },
    };
  },
  async listRoles(actorUserId: string, query: ListRolesQuery) {
    await requireAdmin(actorUserId);
    const search = query.search?.toLocaleLowerCase();
    const filtered = roles.filter(
      (role) =>
        !search ||
        role.toLocaleLowerCase().includes(search) ||
        fixedRoleNames[role].toLocaleLowerCase().includes(search),
    );
    const items = await Promise.all(filtered.map(roleResponse));
    const key = query.sortBy;
    items.sort((left, right) => {
      const leftValue = key === 'updatedAt' ? left.updatedAt.toISOString() : left[key];
      const rightValue = key === 'updatedAt' ? right.updatedAt.toISOString() : right[key];
      return leftValue.localeCompare(rightValue) * (query.sortOrder === 'asc' ? 1 : -1);
    });
    const start = (query.page - 1) * query.limit;
    return {
      items: items.slice(start, start + query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: items.length,
        totalPages: Math.ceil(items.length / query.limit),
      },
    };
  },
  async getRole(actorUserId: string, roleId: string) {
    await requireAdmin(actorUserId);
    const role = roleFromId(roleId);
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');
    return roleResponse(role);
  },
  async configureRolePermissions(
    actorUserId: string,
    roleId: string,
    input: ConfigureRolePermissionsBody,
  ) {
    await requireAdmin(actorUserId);
    const role = roleFromId(roleId);
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');
    if (role === 'ADMIN') {
      throw new AppError(
        422,
        'ADMIN_ROLE_IMMUTABLE',
        'Administrator permissions cannot be changed',
      );
    }
    const requestedCodes = codesFromIds(input.permissionIds);
    const forbiddenCodes = requestedCodes.filter((code) => !canRoleReceivePermission(role, code));
    if (forbiddenCodes.length > 0) {
      throw new AppError(
        422,
        'ROLE_PERMISSION_NOT_ALLOWED',
        'Administrator-only permissions cannot be granted to this role',
      );
    }
    const current = await roleState(role);
    if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new AppError(409, 'ROLE_CHANGED', 'Role permissions changed; reload before saving');
    }
    const requested = requestedCodes.sort();
    if (JSON.stringify(requested) === JSON.stringify(current.permissionCodes)) {
      return { role: await roleResponse(role), changed: false, affectedUserCount: 0 };
    }
    const result = await accessControlRepository.replaceRolePermissions({
      actorUserId,
      role,
      permissionCodes: requested,
      reason: input.reason,
      before: current.permissionCodes,
    });
    return {
      role: await roleResponse(role),
      changed: true,
      affectedUserCount: result.affectedUserCount,
    };
  },
  async getUserPermissions(actorUserId: string, userId: string) {
    await requireAdmin(actorUserId);
    const user = await accessControlRepository.findUser(userId);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
    const rows = await accessControlRepository.listUserOverrides(userId);
    const active = rows.filter(({ expires_at }) => !expires_at || expires_at > new Date());
    const allow = active
      .filter(({ effect }) => effect === 'ALLOW')
      .map(({ scope_code }) => scope_code)
      .filter(isPermissionCode);
    const deny = active
      .filter(({ effect }) => effect === 'DENY')
      .map(({ scope_code }) => scope_code)
      .filter(isPermissionCode);
    const rolePermissions = (await roleState(user.role)).permissionCodes;
    return {
      user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
      editable: user.role !== 'ADMIN',
      allowablePermissions: permissionCatalog
        .map(({ code }) => code)
        .filter((code) => canRoleReceivePermission(user.role, code)),
      rolePermissions,
      allow,
      deny,
      effectivePermissions: [...new Set([...rolePermissions, ...allow])]
        .filter((code) => !deny.includes(code))
        .sort(),
      updatedAt: rows[0]?.assigned_at ?? epoch,
    };
  },
  async configureUserPermissions(
    actorUserId: string,
    userId: string,
    input: ConfigureUserPermissionsBody,
  ) {
    await requireAdmin(actorUserId);
    const allow = codesFromIds(input.allow);
    const deny = codesFromIds(input.deny);
    const current = await this.getUserPermissions(actorUserId, userId);
    if (!current.editable) {
      throw new AppError(
        422,
        'ADMIN_USER_IMMUTABLE',
        'Administrator permissions cannot be overridden',
      );
    }
    if (allow.some((code) => !canRoleReceivePermission(current.user.role, code))) {
      throw new AppError(
        422,
        'ROLE_PERMISSION_NOT_ALLOWED',
        'Administrator-only permissions cannot be granted to this user role',
      );
    }
    await accessControlRepository.replaceUserOverrides({
      actorUserId,
      userId,
      allow,
      deny,
      reason: input.reason,
      beforeAllow: current.allow,
      beforeDeny: current.deny,
    });
    return this.getUserPermissions(actorUserId, userId);
  },
  async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    if (!isPermissionCode(permissionCode)) return false;
    const user = await accessControlRepository.findUser(userId);
    if (!user || user.status !== 'ACTIVE') return false;
    if (user.role === 'ADMIN') return true;
    const [role, overrides] = await Promise.all([
      roleState(user.role),
      accessControlRepository.listUserOverrides(userId),
    ]);
    const active = overrides.filter(({ expires_at }) => !expires_at || expires_at > new Date());
    if (active.some(({ scope_code, effect }) => scope_code === permissionCode && effect === 'DENY'))
      return false;
    if (
      active.some(({ scope_code, effect }) => scope_code === permissionCode && effect === 'ALLOW')
    )
      return true;
    return role.permissionCodes.includes(permissionCode);
  },
} as const;
