import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { toRoleResponse } from './access-control.mapper.js';
import { accessControlRepository } from './access-control.repository.js';
import type { CreateRoleBody, ListRolesQuery, UpdateRoleBody } from './dto/role.dto.js';

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
    if (await accessControlRepository.findByCode(input.code))
      throw new AppError(409, 'ROLE_CODE_EXISTS', 'Role code already exists');
    await ensurePermissionsExist(input.permissionIds);
    try {
      return await accessControlRepository.transaction(async (database) => {
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
    if (input.permissionIds !== undefined) await ensurePermissionsExist(input.permissionIds);
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
