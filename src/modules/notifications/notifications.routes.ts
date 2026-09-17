import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  complianceReminderParamsSchema,
  complianceReminderQuerySchema,
} from './dto/compliance-reminder.dto.js';
import { listComplianceReminders, markComplianceReminderRead } from './notifications.controller.js';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/compliance-reminders',
  authenticate,
  validate({ query: complianceReminderQuerySchema }),
  asyncHandler(listComplianceReminders),
);
notificationsRouter.patch(
  '/compliance-reminders/:notificationId/read',
  authenticate,
  validate({ params: complianceReminderParamsSchema }),
  asyncHandler(markComplianceReminderRead),
);
