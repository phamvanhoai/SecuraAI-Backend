import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizePermission } from '../../common/middleware/authorize-permission.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendInSystemNotificationSchema } from './dto/send-in-system-notification.dto.js';
import { sendInSystemNotification } from './notifications.controller.js';

export const notificationsRouter = Router();
notificationsRouter.post(
  '/',
  authenticate,
  authorizePermission('notifications.send'),
  validate({ body: sendInSystemNotificationSchema }),
  asyncHandler(sendInSystemNotification),
);
