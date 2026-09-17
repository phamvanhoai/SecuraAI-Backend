/** Prisma queries for the notifications module belong here. */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const reminderSelect = {
  notification_id: true,
  entity_id: true,
  title: true,
  message: true,
  is_read: true,
  read_at: true,
  created_at: true,
} satisfies Prisma.notificationsSelect;
export type TrainingReminderRecord = Prisma.notificationsGetPayload<{
  select: typeof reminderSelect;
}>;

export const notificationsRepository = {
  listTrainingReminders(
    userId: string,
    query: { page: number; limit: number; status: 'all' | 'unread'; search?: string | undefined },
  ) {
    const search = query.search?.replace(/[\\%_]/g, '\\$&');
    const where: Prisma.notificationsWhereInput = {
      user_id: userId,
      type: { in: ['training_deadline_3d', 'training_deadline_1d'] },
      ...(query.status === 'unread' ? { is_read: false } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { message: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.notifications.findMany({
        where,
        select: reminderSelect,
        orderBy: [{ created_at: 'desc' }, { notification_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.notifications.count({ where }),
    ]);
  },
  async markTrainingReminderRead(userId: string, notificationId: string, now: Date) {
    const where = {
      user_id: userId,
      notification_id: notificationId,
      type: { in: ['training_deadline_3d', 'training_deadline_1d'] },
    };
    await prisma.notifications.updateMany({
      where: { ...where, is_read: false },
      data: { is_read: true, read_at: now },
    });
    return prisma.notifications.findFirst({ where, select: reminderSelect });
  },
  async createTrainingReminder(
    tx: Prisma.TransactionClient,
    data: Prisma.notificationsCreateManyInput & { notification_id: string; created_at: Date },
  ) {
    const created = await tx.notifications.createMany({ data: [data], skipDuplicates: true });
    if (!created.count) return false;
    await tx.notification_deliveries.create({
      data: {
        notification_id: data.notification_id,
        channel: 'in_app',
        status: 'delivered',
        sent_at: data.created_at,
      },
    });
    return true;
  },
};
