import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { anomalyDetectionService } from './anomaly-detection.service.js';

let timer: NodeJS.Timeout | undefined;
let running = false;
let rerunRequested = false;
const scheduledCycleMs = Math.max(60_000, env.ANOMALY_AUTO_DETECTION_INTERVAL_MS);

async function drainPendingEvents(): Promise<void> {
  if (!env.ANOMALY_AUTO_DETECTION_ENABLED) return;
  if (running) {
    rerunRequested = true;
    return;
  }

  running = true;
  try {
    do {
      rerunRequested = false;
      const result = await anomalyDetectionService.runAutomated({
        maxEvents: 100,
      });
      if (!result || result.eventsEvaluated < 100) break;
      rerunRequested = true;
    } while (rerunRequested);
  } catch (error: unknown) {
    logger.error(
      { err: error },
      'Automated anomaly detection failed; pending events remain available for retry',
    );
  } finally {
    running = false;
    if (rerunRequested) queueMicrotask(() => void drainPendingEvents());
  }
}

export function requestAutomatedDetection(): void {
  // API ingestion only commits events. A separate process discovers durable
  // jobs on its fixed schedule; ingestion never triggers immediate analysis.
  if (env.DETECTION_PIPELINE_ENABLED) return;
  queueMicrotask(() => void drainPendingEvents());
}

export function startAutomatedDetectionWorker(): void {
  if (!env.ANOMALY_AUTO_DETECTION_ENABLED || timer) return;
  timer = setInterval(() => queueMicrotask(() => void drainPendingEvents()), scheduledCycleMs);
  timer.unref();
  logger.info(
    { intervalMs: scheduledCycleMs },
    'Automated anomaly detection worker started',
  );
}

export function stopAutomatedDetectionWorker(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}
