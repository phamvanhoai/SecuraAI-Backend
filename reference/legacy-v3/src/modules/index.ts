import { accessControlModule } from './access-control/index.js';
import { aiAlertsModule } from './ai-anomaly-detection-alerts/index.js';
import { approvalWorkflowModule } from './approval-workflow/index.js';
import { assetManagementModule } from './it-asset-management/index.js';
import { auditSettingsModule } from './audit-security-reporting/index.js';
import { fileManagementModule } from './file-management/index.js';
import { incidentManagementModule } from './information-security-incident-management/index.js';
import { integrationsModule } from './integrations/index.js';
import { notificationsModule } from './notification-system-logs/index.js';
import { organizationModule } from './organization/index.js';
import { policyComplianceModule } from './policy-compliance-control/index.js';
import { reportingModule } from './reporting/index.js';
import { riskManagementModule } from './risk-assessment/index.js';
import { securityMonitoringModule } from './event-ingestion/index.js';

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
  reportingModule,
  notificationsModule,
  auditSettingsModule,
  approvalWorkflowModule,
] as const;
