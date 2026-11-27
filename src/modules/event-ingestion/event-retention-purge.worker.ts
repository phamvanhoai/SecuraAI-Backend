import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { eventRetentionPurgeService } from './event-retention-purge.service.js';

let timer: NodeJS.Timeout | undefined;
let running = false;

/**
 * Executes a single non-overlapping retention purge cycle when enabled.
 */
export async function runRetentionPurgeCycle(): Promise<void> {
  if (!env.RETENTION_PURGE_ENABLED || running) return;

  running = true;
  try {
    await eventRetentionPurgeService.runAutomated();
  } catch (error: unknown) {
    logger.error(
      { err: error },
      'Automated retention purge cycle failed; eligible events remain for next cycle',
    );
  } finally {
    running = false;
  }
}

/**
 * Starts the scheduled retention purge background timer if enabled and not already running.
 */
export function startAutomatedRetentionPurgeWorker(): void {
  if (!env.RETENTION_PURGE_ENABLED || timer) return;

  timer = setInterval(() => void runRetentionPurgeCycle(), env.RETENTION_PURGE_INTERVAL_MS);
  timer.unref();

  if (env.RETENTION_PURGE_RUN_ON_STARTUP) {
    queueMicrotask(() => void runRetentionPurgeCycle());
  }

  logger.info(
    {
      intervalMs: env.RETENTION_PURGE_INTERVAL_MS,
      batchSize: env.RETENTION_PURGE_BATCH_SIZE,
      maxBatchesPerRun: env.RETENTION_PURGE_MAX_BATCHES_PER_RUN,
      runOnStartup: env.RETENTION_PURGE_RUN_ON_STARTUP,
    },
    'Automated retention purge worker started',
  );
}

/**
 * Stops the scheduled retention purge timer cleanly on process shutdown.
 */
export function stopAutomatedRetentionPurgeWorker(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}

/**
 * Reports whether the scheduled retention purge interval timer is currently active.
 */
export function isAutomatedRetentionPurgeWorkerActive(): boolean {
  return Boolean(timer);
}
