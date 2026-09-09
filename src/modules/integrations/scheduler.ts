import { logger } from '../../config/logger.js';
import { integrationsService } from './integrations.service.js';

let schedulerTimer: NodeJS.Timeout | null = null;
let isSchedulerRunning = false;

export async function runSchedulerTick(): Promise<void> {
  if (isSchedulerRunning) {
    logger.debug('Sync scheduler tick skipped: previous cycle is still in progress');
    return;
  }

  isSchedulerRunning = true;
  try {
    await integrationsService.processDueSyncSchedules();
  } catch (err: unknown) {
    logger.error({ err }, 'Error occurred during sync scheduler execution cycle');
  } finally {
    isSchedulerRunning = false;
  }
}

export function startScheduler(intervalMs = 30000): void {
  if (schedulerTimer !== null) {
    return;
  }

  logger.info({ intervalMs }, 'Starting in-process synchronization scheduler');
  schedulerTimer = setInterval(() => {
    void runSchedulerTick();
  }, intervalMs);

  // Unref timer so it doesn't prevent clean process termination in tests/scripts
  if (schedulerTimer.unref) {
    schedulerTimer.unref();
  }
}

export function stopScheduler(): void {
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('Synchronization scheduler stopped');
  }
}

export function getSchedulerStatus(): { isRunning: boolean; isProcessing: boolean } {
  return {
    isRunning: schedulerTimer !== null,
    isProcessing: isSchedulerRunning,
  };
}
