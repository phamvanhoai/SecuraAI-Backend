import type { user_role } from '@prisma/client';
import { capabilitiesByRole } from '../user-management-authorization/role-capabilities.js';

const nonAdminPermissions = new Set<string>([
  ...capabilitiesByRole.SECURITY_OFFICER,
  ...capabilitiesByRole.EXECUTIVE,
  ...capabilitiesByRole.EMPLOYEE,
]);

export const adminOnlyPermissionCodes = new Set<string>(
  capabilitiesByRole.ADMIN.filter((code) => !nonAdminPermissions.has(code)),
);

export function canRoleReceivePermission(role: user_role, permissionCode: string): boolean {
  return role === 'ADMIN' || !adminOnlyPermissionCodes.has(permissionCode);
}
