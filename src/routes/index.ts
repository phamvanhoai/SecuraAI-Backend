import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/authentication-account/index.js';
import { usersRouter } from '../modules/user-management-authorization/index.js';
import {
  aiAlertsRouter,
  anomalyDetectionRouter,
} from '../modules/ai-anomaly-detection-alerts/index.js';
import { policyComplianceRouter } from '../modules/policy-compliance-control/index.js';
import { pendingV2Router } from './pending-v2.routes.js';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/anomaly-detections', anomalyDetectionRouter);
apiRouter.use('/ai-alerts', aiAlertsRouter);
apiRouter.use('/compliance', policyComplianceRouter);
apiRouter.use(pendingV2Router);
