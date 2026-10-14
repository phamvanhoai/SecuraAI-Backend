import type { user_role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { capabilitiesByRole } from '../user-management-authorization/role-capabilities.js';

export type PermissionDefinition = {
  id: string;
  code: string;
  module: string;
  action: string;
  description: string;
};

const descriptions: Readonly<Record<string, string>> = {
  'roles.read': 'View role and permission configuration.',
  'roles.update': 'Configure detailed permissions for non-administrator roles and users.',
  'users.read': 'View user accounts and details.',
  'users.create': 'Create user accounts.',
  'users.update': 'Update user accounts and account status.',
  'users.assign-role': 'Assign a fixed system role and supplemental access scopes.',
};

const codes = [
  ...new Set([...Object.values(capabilitiesByRole).flat(), 'roles.read', 'roles.update']),
].sort();

function permissionId(code: string): string {
  const source = createHash('sha256')
    .update(`securaai-permission:${code}`)
    .digest('hex')
    .slice(0, 32);
  const hex = `${source.slice(0, 12)}4${source.slice(13, 16)}8${source.slice(17)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function title(value: string): string {
  return value
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export const permissionCatalog: readonly PermissionDefinition[] = codes.map((code) => {
  const [module = 'system', action = 'access'] = code.split('.');
  return {
    id: permissionId(code),
    code,
    module,
    action,
    description: descriptions[code] ?? `${title(action)} ${title(module)} resources.`,
  };
});

const permissionCodes = new Set(permissionCatalog.map(({ code }) => code));

export function isPermissionCode(value: string): boolean {
  return permissionCodes.has(value);
}

export function permissionCodeFromId(id: string): string | undefined {
  return permissionCatalog.find((permission) => permission.id === id)?.code;
}

export function defaultPermissionsForRole(role: user_role): readonly string[] {
  if (role === 'ADMIN') return permissionCatalog.map(({ code }) => code);
  return capabilitiesByRole[role];
}

export const fixedRoleNames = {
  ADMIN: 'System Administrator',
  SECURITY_OFFICER: 'Security Officer',
  EXECUTIVE: 'Executive',
  EMPLOYEE: 'Employee',
} as const satisfies Record<user_role, string>;

export const roleIds = {
  ADMIN: '00000000-0000-4000-8000-000000000001',
  SECURITY_OFFICER: '00000000-0000-4000-8000-000000000002',
  EXECUTIVE: '00000000-0000-4000-8000-000000000003',
  EMPLOYEE: '00000000-0000-4000-8000-000000000004',
} as const satisfies Record<user_role, string>;

export const roleConfigurationMarker = '__ROLE_CONFIGURATION__';
