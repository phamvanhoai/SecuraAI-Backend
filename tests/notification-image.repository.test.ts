import { beforeEach, expect, it, vi } from 'vitest';
const findFirst = vi.hoisted(() => vi.fn());
vi.mock('../src/database/prisma.js', () => ({ prisma: { notifications: { findFirst }, notification_recipients: { findFirst } } }));
import { notificationsRepository } from '../src/modules/notification-system-logs/notifications.repository.js';
beforeEach(() => vi.clearAllMocks());
it('looks up notification details only within the current recipient inbox', async () => {
  await notificationsRepository.findInboxItem('actor-id', 'recipient-id');
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'recipient-id', user_id: 'actor-id' },
    select: expect.objectContaining({ notification: expect.any(Object), read_at: true }),
  }));
});
it('restricts image metadata to the authenticated recipient', async () => {
  await notificationsRepository.findReadableImageMessage('actor-id', 'notification-id', false);
  expect(findFirst).toHaveBeenCalledWith({
    where: { id: 'notification-id', notification_recipients: { some: { user_id: 'actor-id' } } },
    select: { image_references: true },
  });
});
it('allows administrator history access without exposing unrelated user data', async () => {
  await notificationsRepository.findReadableImageMessage('admin-id', 'notification-id', true);
  expect(findFirst).toHaveBeenCalledWith({
    where: { id: 'notification-id' },
    select: { image_references: true },
  });
});
