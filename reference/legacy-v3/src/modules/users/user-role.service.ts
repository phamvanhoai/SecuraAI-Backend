import { AppError } from '../../common/errors/app-error.js';
import type { AssignUserRolesBody } from './dto/assign-user-roles.dto.js';
import { userRoleRepository } from './user-role.repository.js';

type RoleActor = { userId: string; roles: readonly string[]; permissions: readonly string[] };

function requireRoleManager(actor: RoleActor): void {
  if (!actor.roles.includes('ADMIN') || !actor.permissions.includes('users.assign-role')) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
}

export const userRoleService = {
  async listAssignable(actor: RoleActor) {
    requireRoleManager(actor);
    const roles = await userRoleRepository.listRoles();
    return roles.map((role) => ({
      code: role.code, name: role.name, description: role.description, isSystem: role.is_system,
    }));
  },

  async assign(userId: string, body: AssignUserRolesBody, actor: RoleActor) {
    requireRoleManager(actor);
    const result = await userRoleRepository.assign(userId, actor.userId, body);
    if (result.kind === 'not_found') throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
    if (result.kind === 'disabled') throw new AppError(409, 'USER_DISABLED', 'Cannot assign roles to a disabled user');
    if (result.kind === 'forbidden') throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    if (result.kind === 'invalid_roles') throw new AppError(422, 'INVALID_ROLES', 'One or more role codes do not exist');
    return { assignedRoleCodes: result.assignedRoleCodes, changed: result.assignedRoleCodes.length > 0 };
  },
};
