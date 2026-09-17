import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { trainingRemindersService } from './training-reminders.service.js';

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await trainingRemindersService.dispatch();
    if (result.delivered || result.hasMore)
      logger.info(result, 'Training deadline reminder batch processed');
  } catch (error: unknown) {
    logger.error(
      { errorType: error instanceof Error ? error.name : 'UnknownError' },
      'Training deadline reminders failed; next run will retry',
    );
  } finally {
    running = false;
  }
}
export function startTrainingReminderScheduler() {
  if (timer || !env.TRAINING_REMINDERS_ENABLED || env.NODE_ENV === 'test') return;
  timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  void tick();
}
export function stopTrainingReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
