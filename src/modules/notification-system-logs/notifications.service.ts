import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';
import type { SendInSystemNotificationInput } from './dto/send-in-system-notification.dto.js';
import { notificationsRepository } from './notifications.repository.js';
import type { SendEmailNotificationInput } from './dto/send-email-notification.dto.js';
import { notificationEmailService } from './notification-email.service.js';

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
    if (result.kind === 'recipients_changed')
      throw new AppError(
        409,
        'NOTIFICATION_RECIPIENTS_CHANGED',
        'Recipient eligibility changed. Review the audience and try again.',
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
    if (result.kind === 'recipients_changed')
      throw new AppError(
        409,
        'EMAIL_RECIPIENTS_CHANGED',
        'Recipient eligibility changed. Review the recipients and try again.',
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
