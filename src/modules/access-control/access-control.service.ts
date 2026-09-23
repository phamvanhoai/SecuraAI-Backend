import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { toPermissionResponse, toRoleResponse } from './access-control.mapper.js';
import { accessControlRepository } from './access-control.repository.js';
import type { ListPermissionsQuery } from './dto/permission.dto.js';
import type {
  ConfigureRolePermissionsBody,
  CreateRoleBody,
  ListRolesQuery,
  UpdateRoleBody,
} from './dto/role.dto.js';

type RoleActor = { userId: string; permissions: readonly string[] };
const requirePermission = (actor: RoleActor, permission: string): void => {
  if (!actor.permissions.includes(permission))
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
};
const ensurePermissionsExist = async (permissionIds: string[]): Promise<void> => {
  if (
    permissionIds.length > 0 &&
    (await accessControlRepository.countPermissions(permissionIds)) !== permissionIds.length
  ) {
    throw new AppError(422, 'INVALID_PERMISSIONS', 'One or more permissions do not exist');
  }
};
const auditSnapshot = (role: ReturnType<typeof toRoleResponse>): Prisma.InputJsonObject => ({
  code: role.code,
  name: role.name,
  description: role.description,
  permissionIds: role.permissions.map((permission) => permission.id),
});

export const accessControlService = {
  async listPermissions(query: ListPermissionsQuery, actor: RoleActor) {
    requirePermission(actor, 'roles.read');
    const result = await accessControlRepository.listPermissions(query);
    return {
      items: result.items.map(toPermissionResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async listRoles(query: ListRolesQuery, actor: RoleActor) {
    requirePermission(actor, 'roles.read');
    const result = await accessControlRepository.listRoles(query);
    return {
      items: result.items.map(toRoleResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async getRole(roleId: string, actor: RoleActor) {
    requirePermission(actor, 'roles.read');
    const role = await accessControlRepository.findById(roleId);
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');
    return toRoleResponse(role);
  },
  async createRole(input: CreateRoleBody, actor: RoleActor) {
    requirePermission(actor, 'roles.create');
    if (input.permissionIds.length > 0) requirePermission(actor, 'roles.update');
    if (await accessControlRepository.findByCode(input.code))
      throw new AppError(409, 'ROLE_CODE_EXISTS', 'Role code already exists');
    await ensurePermissionsExist(input.permissionIds);
    try {
      return await accessControlRepository.transaction(async (database) => {
        if (
          input.permissionIds.length > 0 &&
          !(await accessControlRepository.isCurrentAdmin(actor.userId, database))
        )
          throw new AppError(403, 'FORBIDDEN', 'An active ADMIN account is required');
        const role = await accessControlRepository.create(database, input);
        const response = toRoleResponse(role);
        await accessControlRepository.audit(database, {
          actorUserId: actor.userId,
          action: 'role.created',
          roleId: role.role_id,
          afterData: auditSnapshot(response),
        });
        return response;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError(409, 'ROLE_CODE_EXISTS', 'Role code already exists');
      throw error;
    }
  },
  async updateRole(roleId: string, input: UpdateRoleBody, actor: RoleActor) {
    requirePermission(actor, 'roles.update');
    const current = await accessControlRepository.findById(roleId);
    if (!current) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');
    if (current.is_system)
      throw new AppError(422, 'SYSTEM_ROLE_IMMUTABLE', 'System roles cannot be updated');
    if (
      input.code !== undefined &&
      input.code !== current.code &&
      (await accessControlRepository.findByCode(input.code))
    ) {
      throw new AppError(409, 'ROLE_CODE_EXISTS', 'Role code already exists');
    }
    try {
      return await accessControlRepository.transaction(async (database) => {
        const updated = await accessControlRepository.update(database, roleId, input);
        const response = toRoleResponse(updated);
        await accessControlRepository.audit(database, {
          actorUserId: actor.userId,
          action: 'role.updated',
          roleId,
          beforeData: auditSnapshot(toRoleResponse(current)),
          afterData: auditSnapshot(response),
        });
        return response;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError(409, 'ROLE_CODE_EXISTS', 'Role code already exists');
      throw error;
    }
  },
  async configureRolePermissions(
    roleId: string,
    input: ConfigureRolePermissionsBody,
    actor: RoleActor,
  ) {
    requirePermission(actor, 'roles.update');
    return accessControlRepository.transaction(async (database) => {
      await accessControlRepository.lockRole(database, roleId);
      const current = await accessControlRepository.findById(roleId, database);
      if (!current) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');
      if (current.code === 'ADMIN')
        throw new AppError(422, 'ADMIN_ROLE_IMMUTABLE', 'ADMIN permissions cannot be changed');
      if (current.updated_at.toISOString() !== input.expectedUpdatedAt)
        throw new AppError(409, 'ROLE_CHANGED', 'Role changed; reload before saving permissions');
      if (!(await accessControlRepository.isCurrentAdmin(actor.userId, database)))
        throw new AppError(403, 'FORBIDDEN', 'An active ADMIN account is required');
      if (
        (await accessControlRepository.countPermissions(input.permissionIds, database)) !==
        input.permissionIds.length
      )
        throw new AppError(422, 'INVALID_PERMISSIONS', 'One or more permissions do not exist');
      const previous = current.role_permissions.map(({ permissions }) => permissions.permission_id);
      if (
        previous.length === input.permissionIds.length &&
        previous.every((id) => input.permissionIds.includes(id))
      )
        return { role: toRoleResponse(current), changed: false, affectedUserCount: 0 };
      const role = await accessControlRepository.replacePermissions(
        database,
        roleId,
        input.permissionIds,
      );
      const affectedUserCount = await accessControlRepository.invalidateAssignedUsers(
        database,
        roleId,
      );
      await accessControlRepository.audit(database, {
        actorUserId: actor.userId,
        action: 'role.permissions.configured',
        roleId,
        beforeData: auditSnapshot(toRoleResponse(current)),
        afterData: {
          ...auditSnapshot(toRoleResponse(role)),
          reason: input.reason,
          affectedUserCount,
        },
      });
      return { role: toRoleResponse(role), changed: true, affectedUserCount };
    });
  },
  async deleteRole(roleId: string, actor: RoleActor): Promise<void> {
    requirePermission(actor, 'roles.delete');
    const current = await accessControlRepository.findById(roleId);
    if (!current) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role was not found');
    if (current.is_system)
      throw new AppError(422, 'SYSTEM_ROLE_IMMUTABLE', 'System roles cannot be deleted');
    if (current._count.user_roles > 0 || current._count.workflow_steps > 0)
      throw new AppError(409, 'ROLE_IN_USE', 'Role is assigned to users or approval workflows');
    await accessControlRepository.transaction(async (database) => {
      await accessControlRepository.audit(database, {
        actorUserId: actor.userId,
        action: 'role.deleted',
        roleId,
        beforeData: auditSnapshot(toRoleResponse(current)),
      });
      await accessControlRepository.delete(database, roleId);
    });
  },
} as const;
