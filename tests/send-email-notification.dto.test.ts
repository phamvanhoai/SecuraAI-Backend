import { describe, expect, it } from 'vitest';
import { sendEmailNotificationSchema } from '../src/modules/notification-system-logs/dto/send-email-notification.dto.js';

const userId = '11111111-1111-4111-8111-111111111111';

describe('send email notification DTO', () => {
  it('normalizes content and deduplicates recipients', () => {
    expect(
      sendEmailNotificationSchema.parse({
        subject: '  Review required  ',
        message: '  Review the latest finding.  ',
        userIds: [userId, userId],
      }),
    ).toEqual({
      subject: 'Review required',
      message: 'Review the latest finding.',
      userIds: [userId],
    });
  });

  it.each([
    { subject: '', message: 'Message', userIds: [userId] },
    { subject: 'Subject', message: '', userIds: [userId] },
    { subject: 'Subject', message: 'Message', userIds: [] },
    { subject: 'Subject', message: 'Message', userIds: ['bad-id'] },
    { subject: 'Subject\r\nBcc: attacker@example.com', message: 'Message', userIds: [userId] },
    { subject: 'Subject', message: 'Message', userIds: [userId], html: '<b>unsafe</b>' },
  ])('rejects invalid input %#', (input) => {
    expect(sendEmailNotificationSchema.safeParse(input).success).toBe(false);
  });
});
