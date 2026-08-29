import { Router } from 'express';
import type { ModuleManifest } from '@/modules/module.types.js';

export const organizationModule: ModuleManifest = {
  name: 'organization', routePrefix: '/organization',
  description: 'Departments, teams and organization membership',
  tables: ['departments', 'teams', 'team_members'],
  capabilities: ['Department hierarchy', 'Team CRUD', 'Team membership'],
  router: Router(),
};
