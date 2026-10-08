import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';
import type { SendInSystemNotificationInput } from './dto/send-in-system-notification.dto.js';
import { notificationsRepository } from './notifications.repository.js';
import type { SendEmailNotificationInput } from './dto/send-email-notification.dto.js';
import { notificationEmailService } from './notification-email.service.js';
import type { UpdateNotificationPreferencesInput } from './dto/update-notification-preferences.dto.js';
import type { NotificationInboxQuery } from './dto/notification-inbox.dto.js';
import type { NotificationHistoryQuery } from './dto/notification-history.dto.js';

type SmtpFailure = { code: string; message: string; retryable: boolean };

function classifySmtpFailure(error: unknown): SmtpFailure {
  const smtpCode =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
  const responseCode =
    typeof error === 'object' &&
    error !== null &&
    'responseCode' in error &&
    typeof error.responseCode === 'number'
      ? error.responseCode
      : undefined;

  if (smtpCode === 'EAUTH' || responseCode === 535)
    return {
      code: 'SMTP_AUTHENTICATION_FAILED',
      message: 'The email provider rejected the configured sender credentials.',
      retryable: false,
    };
  if (smtpCode === 'EENVELOPE' || responseCode === 550 || responseCode === 553)
    return {
      code: 'SMTP_RECIPIENT_REJECTED',
      message: 'The email provider rejected the recipient address.',
      retryable: false,
    };
  if (
    smtpCode === 'ETIMEDOUT' ||
    smtpCode === 'ECONNECTION' ||
    smtpCode === 'ESOCKET' ||
    (responseCode !== undefined && responseCode >= 400 && responseCode < 500)
  )
    return {
      code: 'SMTP_TEMPORARILY_UNAVAILABLE',
      message: 'The email provider was temporarily unavailable.',
      retryable: true,
    };
  return {
    code: 'SMTP_DELIVERY_FAILED',
    message: 'The email provider did not accept this message.',
    retryable: false,
  };
}

export const notificationsService = {
  async history(userId: string, query: NotificationHistoryQuery) { const actor = await notificationsRepository.findActor(userId); if (!actor || actor.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required'); if (actor.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Administrator access required'); const result = await notificationsRepository.history(query); return { items: result.items.map((item) => { const deliveries = item.notification_recipients.flatMap((recipient) => recipient.notification_deliveries); return { id: item.id, title: item.title, message: item.message, priority: item.priority, channel: [...new Set(deliveries.map((delivery) => delivery.channel))], createdAt: item.created_at.toISOString(), sender: item.sender.full_name ?? item.sender.email, recipientCount: item.notification_recipients.length, sentCount: deliveries.filter((delivery) => delivery.status === 'SENT' || delivery.status === 'DELIVERED').length, failedCount: deliveries.filter((delivery) => delivery.status === 'FAILED').length, recipients: item.notification_recipients.map((recipient) => ({ name: recipient.user.full_name, email: recipient.user.email, deliveries: recipient.notification_deliveries })) }; }), pagination: { page: query.page, limit: query.limit, total: result.total, pageCount: Math.max(1, Math.ceil(result.total / query.limit)) } }; },
  async inbox(userId: string, query: NotificationInboxQuery) { const actor = await notificationsRepository.findActor(userId); if (!actor || actor.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required'); const result = await notificationsRepository.inbox(userId, query); return { ...result, items: result.items.map((item) => ({ id: item.id, notificationId: item.notification.id, title: item.notification.title, message: item.notification.message, priority: item.notification.priority, sender: item.notification.sender.full_name ?? item.notification.sender.email, senderEmail: item.notification.sender.email, createdAt: item.notification.created_at.toISOString(), readAt: item.read_at?.toISOString() ?? null })) }; },
  async markRead(userId: string, id: string) { await notificationsRepository.markRead(userId, id); return { id, read: true }; },
  async markAllRead(userId: string) { const result = await notificationsRepository.markAllRead(userId); return { updatedCount: result.count }; },
  async getPreferences(userId: string) {
    const actor = await notificationsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const preferences = await notificationsRepository.findPreferences(userId);
    const values = new Map(preferences.map((item) => [item.channel, item]));
    const updatedAt = preferences.reduce<Date | null>(
      (latest, item) => (!latest || item.updated_at > latest ? item.updated_at : latest),
      null,
    );
    return {
      channels: {
        inSystem: values.get('IN_SYSTEM')?.enabled ?? true,
        email: values.get('EMAIL')?.enabled ?? true,
      },
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  },

  async updatePreferences(userId: string, input: UpdateNotificationPreferencesInput) {
    const result = await notificationsRepository.updatePreferences(userId, input);
    if (result.kind === 'unauthorized')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    return {
      channels: input.channels,
      updatedAt: result.updatedAt.toISOString(),
    };
  },

  async send(actorUserId: string, input: SendInSystemNotificationInput) {
    const actor = await notificationsRepository.findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'ADMIN')
      throw new AppError(403, 'FORBIDDEN', 'Administrator access required');

    const recipients = await notificationsRepository.findRecipients(input.audience);
    if (recipients.length > 500)
      throw new AppError(
        422,
        'NOTIFICATION_AUDIENCE_TOO_LARGE',
        'A role-group notification is limited to 500 active recipients.',
      );
    if (input.audience.type === 'users' && recipients.length !== input.audience.userIds.length)
      throw new AppError(
        422,
        'INVALID_NOTIFICATION_RECIPIENTS',
        'Every selected recipient must be an active user.',
      );
    if (recipients.length === 0)
      throw new AppError(422, 'NO_NOTIFICATION_RECIPIENTS', 'No active recipients matched.');

    const result = await notificationsRepository.create(
      actorUserId,
      input,
      recipients.map(({ id }) => id),
    );
    if (result.kind === 'unauthorized')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (result.kind === 'forbidden')
      throw new AppError(403, 'FORBIDDEN', 'Administrator access required');
    if (result.kind === 'no_recipients')
      throw new AppError(
        422,
        'NO_ELIGIBLE_NOTIFICATION_RECIPIENTS',
        'No selected recipient has the in-system channel enabled.',
      );
    return {
      id: result.notification.id,
      recipientCount: result.recipientCount,
      sentAt: result.notification.created_at.toISOString(),
    };
  },

  async sendEmail(actorUserId: string, input: SendEmailNotificationInput) {
    const actor = await notificationsRepository.findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'ADMIN')
      throw new AppError(403, 'FORBIDDEN', 'Administrator access required');
    notificationEmailService.ensureConfigured();

    const recipients = await notificationsRepository.findEmailRecipients(input.userIds);
    if (recipients.length !== input.userIds.length)
      throw new AppError(
        422,
        'INVALID_EMAIL_RECIPIENTS',
        'Every selected recipient must be an active user.',
      );
    const result = await notificationsRepository.prepareEmail(actorUserId, input);
    if (result.kind === 'unauthorized')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (result.kind === 'forbidden')
      throw new AppError(403, 'FORBIDDEN', 'Administrator access required');
    if (result.kind === 'no_recipients')
      throw new AppError(
        422,
        'NO_ELIGIBLE_EMAIL_RECIPIENTS',
        'No selected recipient has the email channel enabled.',
      );

    let sentCount = 0;
    let failedCount = 0;
    for (const delivery of result.deliveries) {
      if (!delivery.destination) {
        await notificationsRepository.markEmailFailed(
          delivery.id,
          'INVALID_DESTINATION',
          'Recipient email is unavailable.',
        );
        failedCount += 1;
        continue;
      }
      try {
        const providerMessageId = await notificationEmailService.send(
          delivery.destination,
          input.subject,
          input.message,
        );
        await notificationsRepository.markEmailSent(delivery.id, providerMessageId);
        sentCount += 1;
      } catch (firstError) {
        let failure = classifySmtpFailure(firstError);
        if (failure.retryable) {
          try {
            const providerMessageId = await notificationEmailService.send(
              delivery.destination,
              input.subject,
              input.message,
            );
            await notificationsRepository.markEmailSent(delivery.id, providerMessageId);
            sentCount += 1;
            continue;
          } catch (retryError) {
            failure = classifySmtpFailure(retryError);
          }
        }
        logger.warn(
          { deliveryId: delivery.id, smtpErrorCode: failure.code },
          'Email notification delivery failed',
        );
        await notificationsRepository.markEmailFailed(
          delivery.id,
          failure.code,
          failure.message,
        );
        failedCount += 1;
      }
    }
    return {
      id: result.notification.id,
      recipientCount: result.deliveries.length,
      sentCount,
      failedCount,
      queuedAt: result.notification.created_at.toISOString(),
    };
  },
};
