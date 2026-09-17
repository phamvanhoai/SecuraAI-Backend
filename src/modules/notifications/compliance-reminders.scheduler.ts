import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { notificationsService } from './notifications.service.js';
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await notificationsService.dispatchComplianceReminders();
    if (result.delivered) logger.info(result, 'Compliance reminder batch processed');
  } catch (error: unknown) {
    logger.error(
      { errorType: error instanceof Error ? error.name : 'UnknownError' },
      'Compliance reminders failed; next run will retry',
    );
  } finally {
    running = false;
  }
}
export function startComplianceReminderScheduler() {
  if (timer || !env.COMPLIANCE_REMINDERS_ENABLED || env.NODE_ENV === 'test') return;
  timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  void tick();
}
export function stopComplianceReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
