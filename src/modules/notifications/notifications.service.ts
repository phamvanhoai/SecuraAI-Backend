/** Business rules and transaction orchestration for the notifications module belong here. */
import type { Prisma } from '@prisma/client';
import {
  notificationsRepository,
  type TrainingReminderRecord,
} from './notifications.repository.js';
import { AppError } from '../../common/errors/app-error.js';

type Actor = { userId: string; permissions: readonly string[] };
function requireEmployeePermission(actor: Actor) {
  if (!actor.permissions.includes('training-assessments.take')) {
    throw new AppError(403, 'FORBIDDEN', 'Training assessment permission required');
  }
}
const mapReminder = (item: TrainingReminderRecord) => ({
  notificationId: item.notification_id,
  enrollmentId: item.entity_id,
  title: item.title,
  message: item.message,
  isRead: item.is_read,
  readAt: item.read_at?.toISOString() ?? null,
  createdAt: item.created_at.toISOString(),
});

export const notificationsService = {
  async listTrainingReminders(
    actor: Actor,
    query: { page: number; limit: number; status: 'all' | 'unread'; search?: string | undefined },
  ) {
    requireEmployeePermission(actor);
    const [items, total] = await notificationsRepository.listTrainingReminders(actor.userId, query);
    return {
      items: items.map(mapReminder),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  },
  async markTrainingReminderRead(actor: Actor, notificationId: string) {
    requireEmployeePermission(actor);
    const item = await notificationsRepository.markTrainingReminderRead(
      actor.userId,
      notificationId,
      new Date(),
    );
    if (!item) throw new AppError(404, 'REMINDER_NOT_FOUND', 'Reminder not found');
    return mapReminder(item);
  },
  createTrainingReminder(
    tx: Prisma.TransactionClient,
    data: {
      notificationId: string;
      userId: string;
      enrollmentId: string;
      title: string;
      message: string;
      milestone: 1 | 3;
      now: Date;
    },
  ) {
    return notificationsRepository.createTrainingReminder(tx, {
      notification_id: data.notificationId,
      user_id: data.userId,
      type: `training_deadline_${data.milestone}d`,
      title: data.title,
      message: data.message,
      entity_type: 'training_enrollment',
      entity_id: data.enrollmentId,
      created_at: data.now,
    });
  },
};
