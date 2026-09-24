import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { notificationsService } from '../notifications/index.js';
import { reminderParamsSchema, reminderQuerySchema } from './dto/reminder.dto.js';
import { trainingRemindersService } from './training-reminders.service.js';

export const listTrainingReminders: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.set('Cache-Control', 'private, no-store');
  res.json({
    success: true,
    data: await notificationsService.listTrainingReminders(
      req.auth,
      reminderQuerySchema.parse(req.query),
    ),
  });
};
export const markTrainingReminderRead: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { notificationId } = reminderParamsSchema.parse(req.params);
  res.set('Cache-Control', 'private, no-store');
  res.json({
    success: true,
    data: await notificationsService.markTrainingReminderRead(req.auth, notificationId),
  });
};
export const authenticateReminderCron: RequestHandler = (req, _res, next) => {
  if (!env.CRON_SECRET)
    throw new AppError(503, 'CRON_NOT_CONFIGURED', 'Reminder scheduler is not configured');
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const supplied = Buffer.from(req.get('authorization') ?? '');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  next();
};
export const dispatchTrainingReminders: RequestHandler = async (_req, res) => {
  if (!env.TRAINING_REMINDERS_ENABLED)
    throw new AppError(503, 'REMINDERS_DISABLED', 'Training reminders are disabled');
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await trainingRemindersService.dispatch() });
};
