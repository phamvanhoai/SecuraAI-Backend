import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { extractClientContext } from '../../common/utils/client-context.js';
import type { RunAnomalyDetectionBody } from './dto/run-anomaly-detection.dto.js';
import { anomalyDetectionService } from './anomaly-detection.service.js';

export const runAnomalyDetection: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const correlationId =
    typeof req.id === 'string' || typeof req.id === 'number' ? `${req.id}` : undefined;
  const context = extractClientContext(req);
  const data = await anomalyDetectionService.run(
    userId,
    req.body as RunAnomalyDetectionBody,
    correlationId,
    context,
  );
  res.status(200).json({ success: true, data });
};
