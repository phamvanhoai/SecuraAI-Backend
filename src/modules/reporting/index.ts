import { Router } from 'express';
import type { ModuleManifest } from '@/modules/module.types.js';

export const reportingModule: ModuleManifest = {
  name: 'reporting', routePrefix: '/reports',
  description: 'Dashboards, scheduled reports and generated files',
  tables: ['dashboard_preferences', 'scheduled_reports', 'report_runs'],
  capabilities: ['Role dashboards', 'Risk/compliance/incident KPIs', 'PDF/Excel exports', 'Scheduled reports'],
  router: Router(),
};
