import { Router } from 'express';
import type { ModuleManifest } from '@/modules/module.types.js';

export const accessControlModule: ModuleManifest = {
  name: 'access-control', routePrefix: '/access-control',
  description: 'Roles, permissions and role assignments',
  tables: ['roles', 'permissions', 'user_roles', 'role_permissions'],
  capabilities: ['Role CRUD', 'Permission matrix', 'Assign roles to users'],
  router: Router(),
};
