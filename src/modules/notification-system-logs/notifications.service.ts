import { AppError } from '../../common/errors/app-error.js';
import type { SendInSystemNotificationInput } from './dto/send-in-system-notification.dto.js';
import { notificationsRepository } from './notifications.repository.js';

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
};
