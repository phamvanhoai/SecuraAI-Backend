import type { ModuleManifest } from '../module.types.js';
import { organizationRouter } from './organization.routes.js';

export const organizationModule: ModuleManifest = {
  name: 'organization', routePrefix: '/organization',
  description: 'Departments, teams and organization membership',
  tables: ['departments', 'teams', 'team_members'],
  capabilities: ['Department hierarchy', 'Team CRUD', 'Team membership'],
  router: organizationRouter,
};
