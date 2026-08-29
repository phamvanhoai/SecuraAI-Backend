import { Router } from 'express';
import type { ModuleManifest } from '@/modules/module.types.js';

export const auditSettingsModule: ModuleManifest = {
  name: 'audit-settings', routePrefix: '/administration',
  description: 'Immutable audit trail and protected system settings',
  tables: ['audit_logs', 'system_settings', 'login_history'],
  capabilities: ['Audit search/export', 'Configuration history', 'System settings', 'Login history'],
  router: Router(),
};
