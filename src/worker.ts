import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/prisma.js';
import {
  startAutomatedDetectionWorker,
  stopAutomatedDetectionWorker,
} from './modules/ai-anomaly-detection-alerts/automated-detection.worker.js';
import { runExplanationJobs } from './modules/ai-anomaly-detection-alerts/explanation-jobs.service.js';

if (!env.DETECTION_PIPELINE_ENABLED)
  throw new Error(
    'Apply the pipeline migration and enable DETECTION_PIPELINE_ENABLED before starting the worker',
  );
let stopping = false;
let explaining = false;
startAutomatedDetectionWorker();
const timer = setInterval(() => {
  if (stopping || explaining) return;
  explaining = true;
  void runExplanationJobs()
    .catch((error: unknown) =>
      logger.error(
        { errorType: error instanceof Error ? error.name : 'Unknown' },
        'Explanation job failed',
      ),
    )
    .finally(() => {
      explaining = false;
    });
}, 2000);
function stop() {
  stopping = true;
  clearInterval(timer);
  stopAutomatedDetectionWorker();
  // In-flight jobs finish or recover through their database lease after exit.
  setTimeout(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  }, 5000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
logger.info('Durable detection and explanation worker started');
