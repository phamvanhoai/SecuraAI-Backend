import type { RoleRecord } from './access-control.repository.js';

export const toPermissionResponse = (permission: {
  permission_id: string;
  code: string;
  module: string;
  action: string;
  description: string | null;
}) => ({
  id: permission.permission_id,
  code: permission.code,
  module: permission.module,
  action: permission.action,
  description: permission.description,
});

export const toRoleResponse = (role: RoleRecord) => ({
  id: role.role_id,
  code: role.code,
  name: role.name,
  description: role.description,
  isSystem: role.is_system,
  permissions: role.role_permissions.map(({ permissions }) => toPermissionResponse(permissions)),
  assignedUserCount: role._count.user_roles,
  workflowStepCount: role._count.workflow_steps,
  createdAt: role.created_at.toISOString(),
  updatedAt: role.updated_at.toISOString(),
});
