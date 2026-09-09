import type { RoleRecord } from './access-control.repository.js';

export const toRoleResponse = (role: RoleRecord) => ({
  id: role.role_id,
  code: role.code,
  name: role.name,
  description: role.description,
  isSystem: role.is_system,
  permissions: role.role_permissions.map(({ permissions }) => ({
    id: permissions.permission_id,
    code: permissions.code,
    module: permissions.module,
    action: permissions.action,
    description: permissions.description,
  })),
  assignedUserCount: role._count.user_roles,
  workflowStepCount: role._count.workflow_steps,
  createdAt: role.created_at.toISOString(),
  updatedAt: role.updated_at.toISOString(),
});
