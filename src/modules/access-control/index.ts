import type { ModuleManifest } from '../module.types.js';
import { accessControlRouter } from './access-control.routes.js';

export const accessControlModule: ModuleManifest = {
  name: 'access-control',
  routePrefix: '/access-control',
  description: 'Roles, permissions and role assignments',
  tables: ['roles', 'permissions', 'user_roles', 'role_permissions'],
  capabilities: [
    'Create custom role',
    'View system and custom roles',
    'Update custom role',
    'Delete custom role',
  ],
  router: accessControlRouter,
};
