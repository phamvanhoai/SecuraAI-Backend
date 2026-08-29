import type { ModuleManifest } from '@/modules/module.types.js';
import { incidentManagementRouter } from './incident-management.routes.js';

export const incidentManagementModule: ModuleManifest = {
  name: 'incident-management', routePrefix: '/incidents',
  description: 'Security incident lifecycle and evidence',
  tables: ['incidents', 'incident_assignments', 'incident_updates', 'incident_evidence', 'incident_risk_links', 'post_incident_reports', 'incident_alert_links'],
  capabilities: ['Report/classify incidents', 'Assign and escalate', 'Evidence/timeline', 'Post-incident report'],
  router: incidentManagementRouter,
};
