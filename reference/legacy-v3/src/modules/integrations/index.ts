import type { ModuleManifest } from '../module.types.js';
import { integrationsRouter } from './integrations.routes.js';

export const integrationsModule: ModuleManifest = {
  name: 'integrations', routePrefix: '/integrations',
  description: 'External API/SIEM integrations and scheduled synchronization',
  tables: ['integrations', 'integration_api_keys', 'sync_schedules', 'sync_jobs', 'integration_logs'],
  capabilities: ['Connection configuration', 'Encrypted API keys', 'Sync schedules/jobs', 'Integration logs'],
  router: integrationsRouter,
};
