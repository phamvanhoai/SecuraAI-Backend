import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/authentication-account/index.js';
import { usersRouter } from '../modules/user-management-authorization/index.js';
import {
  aiAlertsRouter,
  anomalyDetectionRouter,
} from '../modules/ai-anomaly-detection-alerts/index.js';
import { policyComplianceRouter } from '../modules/policy-compliance-control/index.js';
import { eventSourcesRouter, wazuhIngestionRouter } from '../modules/event-ingestion/index.js';
import { riskRegisterRouter } from '../modules/risk-assessment/index.js';
import { assetsRouter } from '../modules/it-asset-management/index.js';
import {
  incidentAssetsRouter,
  incidentControlsRouter,
  incidentRisksRouter,
  controlWeaknessesRouter,
  riskReassessmentRequestsRouter,
} from '../modules/information-security-incident-management/index.js';
import { pendingV2Router } from './pending-v2.routes.js';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/anomaly-detections', anomalyDetectionRouter);
apiRouter.use('/ai-alerts', aiAlertsRouter);
apiRouter.use('/risks', riskRegisterRouter);
apiRouter.use('/assets', assetsRouter);
apiRouter.use('/incidents', incidentAssetsRouter);
apiRouter.use('/incidents', incidentControlsRouter);
apiRouter.use('/incidents', incidentRisksRouter);
apiRouter.use('/incidents', controlWeaknessesRouter);
apiRouter.use('/incidents', riskReassessmentRequestsRouter);
apiRouter.use('/compliance', policyComplianceRouter);
apiRouter.use('/event-sources', eventSourcesRouter);
apiRouter.use('/integrations/wazuh', wazuhIngestionRouter);
apiRouter.use('/event-ingestion/wazuh', wazuhIngestionRouter);
apiRouter.use(pendingV2Router);
