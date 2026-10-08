import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendInSystemNotificationSchema } from './dto/send-in-system-notification.dto.js';
import { notificationsService } from './notifications.service.js';
import { sendEmailNotificationSchema } from './dto/send-email-notification.dto.js';
import { updateNotificationPreferencesSchema } from './dto/update-notification-preferences.dto.js';
import { notificationInboxQuerySchema } from './dto/notification-inbox.dto.js';
import { z } from 'zod';
import { notificationHistoryQuerySchema } from './dto/notification-history.dto.js';
export const getNotificationHistory: RequestHandler = async (req, res) => { const userId: unknown = res.locals.authenticatedUserId; if (typeof userId !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required'); const data = await notificationsService.history(userId, notificationHistoryQuerySchema.parse(req.query)); res.json({ success: true, data }); };

export const getNotificationInbox: RequestHandler = async (req, res) => { const userId: unknown = res.locals.authenticatedUserId; if (typeof userId !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required'); const data = await notificationsService.inbox(userId, notificationInboxQuerySchema.parse(req.query)); res.json({ success: true, data }); };
export const markNotificationRead: RequestHandler = async (req, res) => { const userId: unknown = res.locals.authenticatedUserId; if (typeof userId !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required'); const data = await notificationsService.markRead(userId, z.string().uuid().parse(req.params.id)); res.json({ success: true, data }); };
export const markAllNotificationsRead: RequestHandler = async (_req, res) => { const userId: unknown = res.locals.authenticatedUserId; if (typeof userId !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required'); const data = await notificationsService.markAllRead(userId); res.json({ success: true, data }); };

export const getNotificationPreferences: RequestHandler = async (_req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await notificationsService.getPreferences(userId);
  res.status(200).json({ success: true, data });
};

export const updateNotificationPreferences: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await notificationsService.updatePreferences(
    userId,
    updateNotificationPreferencesSchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

export const sendInSystemNotification: RequestHandler = async (req, res) => {
  const actorUserId: unknown = res.locals.authenticatedUserId;
  if (typeof actorUserId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await notificationsService.send(
    actorUserId,
    sendInSystemNotificationSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};

export const sendEmailNotification: RequestHandler = async (req, res) => {
  const actorUserId: unknown = res.locals.authenticatedUserId;
  if (typeof actorUserId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await notificationsService.sendEmail(
    actorUserId,
    sendEmailNotificationSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
