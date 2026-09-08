import type { ModuleManifest } from '../module.types.js';
import { securityMonitoringRouter } from './security-monitoring.routes.js';

export const securityMonitoringModule: ModuleManifest = {
  name: 'security-monitoring',
  routePrefix: '/security-monitoring',
  description: 'Log sources and normalized security events',
  tables: ['log_sources', 'security_events'],
  capabilities: [
    'Configure and list log sources',
    'Ingest events',
    'Normalize/search events',
    'Event traceability',
  ],
  router: securityMonitoringRouter,
};
