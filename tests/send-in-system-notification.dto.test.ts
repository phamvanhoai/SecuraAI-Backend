import { describe, expect, it } from 'vitest';
import { sendInSystemNotificationSchema } from '../src/modules/notification-system-logs/dto/send-in-system-notification.dto.js';

const userId = '11111111-1111-4111-8111-111111111111';

describe('send in-system notification DTO', () => {
  it('normalizes content and removes duplicate recipients', () => {
    expect(
      sendInSystemNotificationSchema.parse({
        title: '  Review required  ',
        message: '  Review the latest finding.  ',
        priority: 'IMPORTANT',
        audience: { type: 'users', userIds: [userId, userId] },
      }),
    ).toEqual({
      title: 'Review required',
      message: 'Review the latest finding.',
      priority: 'IMPORTANT',
      audience: { type: 'users', userIds: [userId] },
    });
  });

  it.each([
    {},
    { title: '', message: 'Message', priority: 'NORMAL', audience: { type: 'roles', roles: ['ADMIN'] } },
    { title: 'Title', message: '', priority: 'NORMAL', audience: { type: 'roles', roles: ['ADMIN'] } },
    { title: 'Title', message: 'Message', priority: 'HIGH', audience: { type: 'roles', roles: ['ADMIN'] } },
    { title: 'Title', message: 'Message', priority: 'NORMAL', audience: { type: 'roles', roles: [] } },
    { title: 'Title', message: 'Message', priority: 'NORMAL', audience: { type: 'users', userIds: ['bad'] } },
    { title: 'Title', message: 'Message', priority: 'NORMAL', audience: { type: 'users', userIds: [userId], roles: ['ADMIN'] } },
  ])('rejects invalid payload %#', (input) => {
    expect(sendInSystemNotificationSchema.safeParse(input).success).toBe(false);
  });
});
