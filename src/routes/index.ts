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

// AI Anomaly Detection & Alerts use cases:
// - Run Anomaly Detection starts in anomaly-detection.routes.ts and calls
//   the runAnomalyDetection controller through POST /runs.
// - Configure Detection Threshold starts in ai-alerts.routes.ts and calls
//   the configureDetectionThreshold controller through PUT /thresholds.
// The final URL combines API_PREFIX, the path below, and the module path.
// Example: /api/v1 + /ai-alerts + /thresholds.
apiRouter.use('/anomaly-detections', anomalyDetectionRouter);
apiRouter.use('/ai-alerts', aiAlertsRouter);

// Risk, asset, incident, and compliance routes.
apiRouter.use('/risks', riskRegisterRouter);
apiRouter.use('/risks', riskReassessmentReviewRouter);
apiRouter.use('/assets', assetsRouter);
apiRouter.use('/business-services', businessServicesRouter);
apiRouter.use('/incidents', incidentAssetsRouter);
apiRouter.use('/incidents', incidentControlsRouter);
apiRouter.use('/incidents', incidentRisksRouter);
apiRouter.use('/incidents', controlWeaknessesRouter);
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
