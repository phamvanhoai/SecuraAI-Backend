import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendInSystemNotificationSchema } from './dto/send-in-system-notification.dto.js';
import { notificationsService } from './notifications.service.js';

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
