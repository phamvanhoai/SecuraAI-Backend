import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { SendInSystemNotificationInput } from './dto/send-in-system-notification.dto.js';

export const notificationsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  findRecipients(audience: SendInSystemNotificationInput['audience']) {
    return prisma.users.findMany({
      where: {
        status: 'ACTIVE',
        ...(audience.type === 'roles'
          ? { role: { in: audience.roles } }
          : { id: { in: audience.userIds } }),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: audience.type === 'roles' ? 501 : 200,
    });
  },

  create(actorUserId: string, input: SendInSystemNotificationInput, recipientIds: string[]) {
    return prisma.$transaction(async (tx) => {
      const actor = await tx.users.findUnique({
        where: { id: actorUserId },
        select: { role: true, status: true },
      });
      if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
      if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;

      const activeRecipients = await tx.users.findMany({
        where: {
          id: { in: recipientIds },
          status: 'ACTIVE',
          ...(input.audience.type === 'roles' ? { role: { in: input.audience.roles } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (activeRecipients.length !== recipientIds.length)
        return { kind: 'recipients_changed' } as const;

      const notification = await tx.notifications.create({
        data: {
          title: input.title,
          message: input.message,
          priority: input.priority,
          audience_type: input.audience.type === 'roles' ? 'ROLES' : 'USERS',
          audience_definition:
            input.audience.type === 'roles'
              ? { roles: input.audience.roles }
              : { userIds: input.audience.userIds },
          sent_by: actorUserId,
        },
        select: { id: true, created_at: true },
      });
      await tx.notification_recipients.createMany({
        data: activeRecipients.map(({ id }) => ({ notification_id: notification.id, user_id: id })),
      });
      const recipientRecords = await tx.notification_recipients.findMany({
        where: { notification_id: notification.id },
        select: { id: true },
      });
      const deliveredAt = new Date();
      await tx.notification_deliveries.createMany({
        data: recipientRecords.map(({ id }) => ({
          notification_recipient_id: id,
          channel: 'IN_SYSTEM',
          status: 'DELIVERED',
          created_at: deliveredAt,
          updated_at: deliveredAt,
          sent_at: deliveredAt,
          delivered_at: deliveredAt,
        })),
      });
      const auditId = randomUUID();
      const after = {
        notificationId: notification.id,
        priority: input.priority,
        audienceType: input.audience.type,
        recipientCount: activeRecipients.length,
      };
      await tx.audit_logs.create({
        data: {
          id: auditId,
          actor_type: 'USER',
          actor_user_id: actorUserId,
          action: 'IN_SYSTEM_NOTIFICATION_SENT',
          resource_type: 'NOTIFICATION',
          resource_id: notification.id,
          source: 'API',
          after_data: after,
          record_hash: createHash('sha256')
            .update(JSON.stringify({ id: auditId, actorUserId, after }))
            .digest('hex'),
        },
        select: { id: true },
      });
      return { kind: 'created', notification, recipientCount: activeRecipients.length } as const;
    });
  },
};
