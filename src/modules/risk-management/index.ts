import type { ModuleManifest } from '../module.types.js';
import { riskManagementRouter } from './risk-management.routes.js';

export const riskManagementModule: ModuleManifest = {
  name: 'risk-management', routePrefix: '/risks',
  description: 'Risk assessment, threats, vulnerabilities and treatment',
  tables: ['threats', 'vulnerabilities', 'risk_assessments', 'risk_assessment_threats', 'risk_assessment_vulnerabilities', 'risk_treatment_plans', 'risk_treatment_actions'],
  capabilities: ['Risk assessment', 'Risk matrix/history', 'Treatment plans', 'Treatment progress'],
  router: riskManagementRouter,
};
