import type { ModuleManifest } from '../module.types.js';
import { auditSettingsRouter } from './audit-settings.routes.js';

export const auditSettingsModule: ModuleManifest = {
  name: 'audit-settings',
  routePrefix: '/administration',
  description: 'Protected login history querying; audit trail and settings are reserved',
  tables: ['audit_logs', 'system_settings', 'login_history'],
  capabilities: ['Login history'],
  router: auditSettingsRouter,
};
