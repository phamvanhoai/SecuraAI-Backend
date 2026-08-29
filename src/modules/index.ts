import { accessControlModule } from './access-control/index.js';
import { aiAlertsModule } from './ai-alerts/index.js';
import { approvalWorkflowModule } from './approval-workflow/index.js';
import { assetManagementModule } from './asset-management/index.js';
import { auditSettingsModule } from './audit-settings/index.js';
import { fileManagementModule } from './file-management/index.js';
import { incidentManagementModule } from './incident-management/index.js';
import { integrationsModule } from './integrations/index.js';
import { notificationsModule } from './notifications/index.js';
import { organizationModule } from './organization/index.js';
import { policyComplianceModule } from './policy-compliance/index.js';
import { reportingModule } from './reporting/index.js';
import { riskManagementModule } from './risk-management/index.js';
import { securityMonitoringModule } from './security-monitoring/index.js';
import { trainingAwarenessModule } from './training-awareness/index.js';

export const businessModules = [
  accessControlModule,
  organizationModule,
  fileManagementModule,
  assetManagementModule,
  riskManagementModule,
  policyComplianceModule,
  incidentManagementModule,
  integrationsModule,
  securityMonitoringModule,
  aiAlertsModule,
  trainingAwarenessModule,
  reportingModule,
  notificationsModule,
  auditSettingsModule,
  approvalWorkflowModule,
] as const;
