import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  complianceReminderParamsSchema,
  complianceReminderQuerySchema,
} from './dto/compliance-reminder.dto.js';
import { notificationsService } from './notifications.service.js';
export const listComplianceReminders: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({
    success: true,
    data: await notificationsService.listComplianceReminders(
      req.auth,
      complianceReminderQuerySchema.parse(req.query),
    ),
  });
};
export const markComplianceReminderRead: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { notificationId } = complianceReminderParamsSchema.parse(req.params);
  res.json({
    success: true,
    data: await notificationsService.markComplianceReminderRead(req.auth, notificationId),
  });
};
