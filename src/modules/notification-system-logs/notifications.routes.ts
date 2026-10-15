import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizePermission } from '../../common/middleware/authorize-permission.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendEmailNotificationSchema } from './dto/send-email-notification.dto.js';
import { sendInSystemNotificationSchema } from './dto/send-in-system-notification.dto.js';
import { updateNotificationPreferencesSchema } from './dto/update-notification-preferences.dto.js';
import {
  getNotificationPreferences,
  sendEmailNotification,
  sendInSystemNotification,
  updateNotificationPreferences,
  getNotificationInbox, markNotificationRead, markAllNotificationsRead,
  getNotificationHistory,
} from './notifications.controller.js';

export const notificationsRouter = Router();
notificationsRouter.get('/inbox', authenticate, asyncHandler(getNotificationInbox));
notificationsRouter.patch('/inbox/read-all', authenticate, asyncHandler(markAllNotificationsRead));
notificationsRouter.patch('/inbox/:id/read', authenticate, asyncHandler(markNotificationRead));
notificationsRouter.get('/history', authenticate, asyncHandler(getNotificationHistory));
notificationsRouter.get(
  '/preferences',
  authenticate,
  authorizePermission('notifications.preferences'),
  asyncHandler(getNotificationPreferences),
);
notificationsRouter.patch(
  '/preferences',
  authenticate,
  authorizePermission('notifications.preferences'),
  validate({ body: updateNotificationPreferencesSchema }),
  asyncHandler(updateNotificationPreferences),
);
notificationsRouter.post(
  '/email',
  authenticate,
  authorizePermission('notifications.send-email'),
  validate({ body: sendEmailNotificationSchema }),
  asyncHandler(sendEmailNotification),
);
notificationsRouter.post(
  '/',
  authenticate,
  authorizePermission('notifications.send'),
  validate({ body: sendInSystemNotificationSchema }),
  asyncHandler(sendInSystemNotification),
);
