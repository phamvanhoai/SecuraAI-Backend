import type { ModuleManifest } from '../module.types.js';
import { auditSettingsRouter } from './audit-settings.routes.js';

export const auditSettingsModule: ModuleManifest = {
  name: 'audit-settings', routePrefix: '/administration',
  description: 'Immutable audit trail and protected system settings',
  tables: ['audit_logs', 'system_settings', 'login_history'],
  capabilities: ['Audit search/export', 'Configuration history', 'System settings', 'Login history'],
  router: auditSettingsRouter,
};
