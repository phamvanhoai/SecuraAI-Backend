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
import { auditLogsRouter } from '../modules/audit-security-reporting/index.js';
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
import { accessControlRouter } from '../modules/access-control/index.js';
import { notificationsRouter, systemLogsRouter } from '../modules/notification-system-logs/index.js';
import { auditRouter } from '../modules/audit-security-reporting/index.js';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/access-control', accessControlRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/system-logs', systemLogsRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/anomaly-detections', anomalyDetectionRouter);
apiRouter.use('/ai-alerts', aiAlertsRouter);
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
apiRouter.use('/event-sources', eventSourcesRouter);
apiRouter.use('/events', normalizedEventsRouter);
apiRouter.use('/event-ingestion/events', normalizedEventsRouter);
apiRouter.use('/event-governance/policies', eventGovernanceRouter);
apiRouter.use('/event-governance', eventGovernanceRouter);
apiRouter.use('/event-data-governance-policies', eventGovernanceRouter);
apiRouter.use('/event-ingestion/governance-policies', eventGovernanceRouter);
apiRouter.use('/integrations/wazuh', wazuhIngestionRouter);
apiRouter.use('/event-ingestion/wazuh', wazuhIngestionRouter);
apiRouter.use('/audit-logs', auditLogsRouter);
apiRouter.use('/audit-security-reporting/audit-logs', auditLogsRouter);
apiRouter.use('/audits', auditLogsRouter);
apiRouter.use(pendingV2Router);
