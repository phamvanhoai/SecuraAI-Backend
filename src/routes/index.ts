import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/authentication-account/index.js';
import { usersRouter } from '../modules/user-management-authorization/index.js';
import {
  aiAlertsRouter,
  anomalyDetectionRouter,
} from '../modules/ai-anomaly-detection-alerts/index.js';
import { policyComplianceRouter } from '../modules/policy-compliance-control/index.js';
import {
  eventGovernanceRouter,
  eventSourcesRouter,
  normalizedEventsRouter,
  wazuhIngestionRouter,
} from '../modules/event-ingestion/index.js';
import {
  auditLogsRouter,
  integrationApiKeysRouter,
  integrationSourceApiKeysRouter,
  loginHistoryRouter,
  reportExportsRouter,
  securityDashboardRouter,
} from '../modules/audit-security-reporting/index.js';
import {
  riskRegisterRouter,
  riskReassessmentReviewRouter,
} from '../modules/risk-assessment/index.js';
import { assetsRouter, businessServicesRouter } from '../modules/it-asset-management/index.js';
import {
  incidentAssetsRouter,
  incidentControlsRouter,
  incidentRisksRouter,
  controlWeaknessesRouter,
  riskReassessmentRequestsRouter,
  incidentsRouter,
} from '../modules/information-security-incident-management/index.js';
import { pendingV2Router } from './pending-v2.routes.js';
import { notificationsRouter, systemLogsRouter } from '../modules/notification-system-logs/index.js';
import { auditRouter } from '../modules/audit-security-reporting/index.js';

// This is the main router for all backend modules.
// app.ts mounts it under API_PREFIX, which is normally /api/v1.
export const apiRouter = Router();

// Core account and system routes.
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/system-logs', systemLogsRouter);
apiRouter.use('/audit', auditRouter);

// Run Anomaly Detection starts at POST /runs and contains two internal flows:
// Generate Anomaly Score evaluates each event, then Generate Anomaly Alert
// groups anomalous results and stores their alert and audit records.
apiRouter.use('/anomaly-detections', anomalyDetectionRouter);

// Alert list/detail/filter, score, features, XAI, model versions,
// thresholds, triage and feedback.
// Open ai-alerts.routes.ts -> its controller name is the last route argument.
apiRouter.use('/ai-alerts', aiAlertsRouter);

// Risk, asset, incident, and compliance routes.
apiRouter.use('/risks', riskRegisterRouter);

// Review Risk Reassessment Request and Reassess Residual Risk.
// Open risk-reassessment-review.routes.ts.
apiRouter.use('/risks', riskReassessmentReviewRouter);
apiRouter.use('/assets', assetsRouter);
apiRouter.use('/business-services', businessServicesRouter);

// Link Incident to Asset -> incident-assets.routes.ts -> linkIncidentAsset.
apiRouter.use('/incidents', incidentAssetsRouter);

// Link Incident to Control -> incident-controls.routes.ts -> linkIncidentControl.
apiRouter.use('/incidents', incidentControlsRouter);

// Link Incident to Existing Risk -> incident-risks.routes.ts -> linkIncidentRisk.
apiRouter.use('/incidents', incidentRisksRouter);

// Record Control Weakness -> control-weaknesses.routes.ts -> recordControlWeakness.
apiRouter.use('/incidents', controlWeaknessesRouter);

// Create Risk Reassessment Request.
// Open risk-reassessment-requests.routes.ts -> createRiskReassessmentRequest.
apiRouter.use('/incidents', riskReassessmentRequestsRouter);
apiRouter.use('/incidents', incidentsRouter);
apiRouter.use('/compliance', policyComplianceRouter);

// Event ingestion and integration routes. Some routers are mounted at more
// than one path to support the API contracts used by different clients.
apiRouter.use('/event-sources', eventSourcesRouter);
apiRouter.use('/event-sources', integrationSourceApiKeysRouter);
apiRouter.use('/events', normalizedEventsRouter);
apiRouter.use('/event-ingestion/events', normalizedEventsRouter);
apiRouter.use('/event-governance/policies', eventGovernanceRouter);
apiRouter.use('/event-governance', eventGovernanceRouter);
apiRouter.use('/event-data-governance-policies', eventGovernanceRouter);
apiRouter.use('/event-ingestion/governance-policies', eventGovernanceRouter);
apiRouter.use('/integrations/wazuh', wazuhIngestionRouter);
apiRouter.use('/event-ingestion/wazuh', wazuhIngestionRouter);
apiRouter.use('/integrations', integrationSourceApiKeysRouter);
apiRouter.use('/integrations/api-keys', integrationApiKeysRouter);

// Audit and reporting routes. Several paths point to the same router as
// supported aliases; they do not create separate implementations.
apiRouter.use('/audit-logs', auditLogsRouter);
apiRouter.use('/login-history', loginHistoryRouter);
apiRouter.use('/administration/login-history', loginHistoryRouter);
apiRouter.use('/audit-security-reporting/audit-logs', auditLogsRouter);
apiRouter.use('/audit-security-reporting/api-keys', integrationApiKeysRouter);
apiRouter.use('/audit-security-reporting/dashboard', securityDashboardRouter);
apiRouter.use('/audit-security-reporting/reports/exports', reportExportsRouter);
apiRouter.use('/audit-security-reporting/reports', reportExportsRouter);
apiRouter.use('/reports/exports', reportExportsRouter);
apiRouter.use('/reports', reportExportsRouter);
apiRouter.use('/dashboard', securityDashboardRouter);
apiRouter.use('/api-keys', integrationApiKeysRouter);
apiRouter.use('/audits', auditLogsRouter);

// Keep recognized but unfinished V2 contracts at the end so implemented
// module routes get the first chance to handle a request.
apiRouter.use(pendingV2Router);
