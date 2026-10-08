import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import type { SendInSystemNotificationInput } from './dto/send-in-system-notification.dto.js';
import type { SendEmailNotificationInput } from './dto/send-email-notification.dto.js';
import type { UpdateNotificationPreferencesInput } from './dto/update-notification-preferences.dto.js';
import type { NotificationInboxQuery } from './dto/notification-inbox.dto.js';
import type { NotificationHistoryQuery } from './dto/notification-history.dto.js';

const transactionOptions = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export const notificationsRepository = {
  async history(query: NotificationHistoryQuery) {
    const where = {};
    const [items, total] = await prisma.$transaction([
      prisma.notifications.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit, select: { id: true, title: true, message: true, priority: true, created_at: true, audience_type: true, sender: { select: { full_name: true, email: true } }, notification_recipients: { select: { user: { select: { full_name: true, email: true } }, notification_deliveries: { select: { channel: true, status: true, last_error_code: true, last_error_message: true, sent_at: true, delivered_at: true } } } } } }),
      prisma.notifications.count({ where }),
    ]);
    return { items, total };
  },
  async inbox(userId: string, query: NotificationInboxQuery) {
    const where = { user_id: userId, ...(query.unread === 'true' ? { read_at: null } : query.unread === 'false' ? { NOT: { read_at: null } } : {}) };
    const [items, total, unreadCount] = await prisma.$transaction([
      prisma.notification_recipients.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit, select: { id: true, read_at: true, created_at: true, notification: { select: { id: true, title: true, message: true, priority: true, created_at: true, sender: { select: { full_name: true, email: true } } } } } }),
      prisma.notification_recipients.count({ where }),
      prisma.notification_recipients.count({ where: { user_id: userId, read_at: null } }),
    ]);
    return { items, unreadCount, pagination: { page: query.page, limit: query.limit, total, pageCount: Math.max(1, Math.ceil(total / query.limit)) } };
  },
  markRead(userId: string, id: string) { return prisma.notification_recipients.updateMany({ where: { id, user_id: userId, read_at: null }, data: { read_at: new Date() } }); },
  markAllRead(userId: string) { return prisma.notification_recipients.updateMany({ where: { user_id: userId, read_at: null }, data: { read_at: new Date() } }); },
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  findPreferences(userId: string) {
    return prisma.notification_preferences.findMany({
      where: { user_id: userId, event_type: 'ALL' },
      select: { channel: true, enabled: true, updated_at: true },
      orderBy: { channel: 'asc' },
    });
  },

  updatePreferences(userId: string, input: UpdateNotificationPreferencesInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await tx.users.findUnique({
        where: { id: userId },
        select: { status: true },
      });
      if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;

      const updatedAt = new Date();
      const preferences = [
        { channel: 'IN_SYSTEM' as const, enabled: input.channels.inSystem },
        { channel: 'EMAIL' as const, enabled: input.channels.email },
      ];
      for (const preference of preferences) {
        await tx.notification_preferences.upsert({
          where: {
            user_id_channel_event_type: {
              user_id: userId,
              channel: preference.channel,
              event_type: 'ALL',
            },
          },
          create: {
            user_id: userId,
            channel: preference.channel,
            event_type: 'ALL',
            enabled: preference.enabled,
            created_at: updatedAt,
            updated_at: updatedAt,
          },
          update: { enabled: preference.enabled, updated_at: updatedAt },
          select: { id: true },
        });
      }

      const auditId = randomUUID();
      const after = { channels: input.channels };
      await tx.audit_logs.create({
        data: {
          id: auditId,
          actor_type: 'USER',
          actor_user_id: userId,
          action: 'PERSONAL_NOTIFICATION_PREFERENCES_UPDATED',
          resource_type: 'USER_NOTIFICATION_PREFERENCES',
          resource_id: userId,
          source: 'API',
          after_data: after,
          record_hash: createHash('sha256')
            .update(JSON.stringify({ id: auditId, userId, after }))
            .digest('hex'),
        },
        select: { id: true },
      });
      return { kind: 'updated', preferences, updatedAt } as const;
    }, transactionOptions);
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
          notification_preferences: {
            none: { channel: 'IN_SYSTEM', event_type: 'ALL', enabled: false },
          },
          ...(input.audience.type === 'roles' ? { role: { in: input.audience.roles } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (activeRecipients.length === 0) return { kind: 'no_recipients' } as const;

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
    }, transactionOptions);
  },

  findEmailRecipients(userIds: string[]) {
    return prisma.users.findMany({
      where: { id: { in: userIds }, status: 'ACTIVE' },
      select: { id: true, email: true },
      orderBy: { id: 'asc' },
    });
  },

  prepareEmail(actorUserId: string, input: SendEmailNotificationInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await tx.users.findUnique({
        where: { id: actorUserId },
        select: { role: true, status: true },
      });
      if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
      if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;
      const recipients = await tx.users.findMany({
        where: {
          id: { in: input.userIds },
          status: 'ACTIVE',
          notification_preferences: {
            none: { channel: 'EMAIL', event_type: 'ALL', enabled: false },
          },
        },
        select: { id: true, email: true },
        orderBy: { id: 'asc' },
      });
      if (recipients.length === 0) return { kind: 'no_recipients' } as const;

      const notification = await tx.notifications.create({
        data: {
          title: input.subject,
          message: input.message,
          priority: 'NORMAL',
          audience_type: 'USERS',
          audience_definition: { userIds: input.userIds },
          sent_by: actorUserId,
        },
        select: { id: true, created_at: true },
      });
      await tx.notification_recipients.createMany({
        data: recipients.map(({ id }) => ({ notification_id: notification.id, user_id: id })),
      });
      const records = await tx.notification_recipients.findMany({
        where: { notification_id: notification.id },
        select: { id: true, user_id: true },
      });
      const emails = new Map(recipients.map(({ id, email }) => [id, email]));
      const createdAt = new Date();
      const deliveryRows = records.map((record) => {
        const destination = emails.get(record.user_id);
        if (destination === undefined)
          throw new AppError(
            409,
            'EMAIL_RECIPIENTS_CHANGED',
            'Recipient eligibility changed. Review the recipients and try again.',
          );
        return {
          notification_recipient_id: record.id,
          channel: 'EMAIL' as const,
          destination,
          status: 'PENDING' as const,
          created_at: createdAt,
          updated_at: createdAt,
        };
      });
      await tx.notification_deliveries.createMany({
        data: deliveryRows,
      });
      const deliveries = await tx.notification_deliveries.findMany({
        where: {
          notification_recipient_id: { in: records.map(({ id }) => id) },
          channel: 'EMAIL',
        },
        select: { id: true, destination: true },
        orderBy: { id: 'asc' },
      });
      const auditId = randomUUID();
      const after = {
        notificationId: notification.id,
        channel: 'EMAIL',
        recipientCount: deliveries.length,
      };
      await tx.audit_logs.create({
        data: {
          id: auditId,
          actor_type: 'USER',
          actor_user_id: actorUserId,
          action: 'EMAIL_NOTIFICATION_QUEUED',
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
      return { kind: 'prepared', notification, deliveries } as const;
    }, transactionOptions);
  },

  markEmailSent(deliveryId: string, providerMessageId: string | null) {
    const sentAt = new Date();
    return prisma.notification_deliveries.update({
      where: { id: deliveryId },
      data: {
        status: 'SENT',
        attempt_count: { increment: 1 },
        provider_message_id: providerMessageId,
        last_attempt_at: sentAt,
        sent_at: sentAt,
        updated_at: sentAt,
        last_error_code: null,
        last_error_message: null,
      },
      select: { id: true },
    });
  },

  markEmailFailed(deliveryId: string, errorCode: string, errorMessage: string) {
    const attemptedAt = new Date();
    return prisma.notification_deliveries.update({
      where: { id: deliveryId },
      data: {
        status: 'FAILED',
        attempt_count: { increment: 1 },
        last_error_code: errorCode,
        last_error_message: errorMessage,
        last_attempt_at: attemptedAt,
        updated_at: attemptedAt,
      },
      select: { id: true },
    });
  },
};
