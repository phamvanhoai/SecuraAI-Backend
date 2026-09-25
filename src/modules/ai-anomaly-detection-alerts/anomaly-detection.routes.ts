import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { runAnomalyDetection } from './anomaly-detection.controller.js';
import { runAnomalyDetectionBodySchema } from './dto/run-anomaly-detection.dto.js';

export const anomalyDetectionRouter = Router();
const runLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
anomalyDetectionRouter.post(
  '/runs',
  authenticate,
  runLimiter,
  validate({ body: runAnomalyDetectionBodySchema }),
  asyncHandler(runAnomalyDetection),
);
