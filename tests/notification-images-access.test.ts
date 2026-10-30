import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  findActor: vi.fn(),
  findReadableImageMessage: vi.fn(),
  readNotificationImage: vi.fn(),
}));
vi.mock('../src/modules/notification-system-logs/notifications.repository.js', () => ({
  notificationsRepository: mocks,
}));
vi.mock(
  '../src/modules/notification-system-logs/notification-images.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    readNotificationImage: mocks.readNotificationImage,
  }),
);
import { notificationsService } from '../src/modules/notification-system-logs/notifications.service.js';
const userId = '11111111-1111-4111-8111-111111111111';
const notificationId = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findActor.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
});
it('does not disclose files to a user outside the notification audience', async () => {
  mocks.findReadableImageMessage.mockResolvedValue(null);
  await expect(notificationsService.image(userId, notificationId, 0)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(mocks.findReadableImageMessage).toHaveBeenCalledWith(userId, notificationId, false);
  expect(mocks.readNotificationImage).not.toHaveBeenCalled();
});
it('requires an active account before resolving an image', async () => {
  mocks.findActor.mockResolvedValue({ role: 'ADMIN', status: 'INACTIVE' });
  await expect(notificationsService.image(userId, notificationId, 0)).rejects.toMatchObject({
    statusCode: 401,
  });
  expect(mocks.findReadableImageMessage).not.toHaveBeenCalled();
});
it('serves an eligible recipient image after the ownership query', async () => {
  mocks.findReadableImageMessage.mockResolvedValue({
    image_references: [{ id: notificationId, name: 'test.png', sha256: 'a'.repeat(64) }],
  });
  mocks.readNotificationImage.mockResolvedValue(Buffer.from('verified-image'));
  await expect(notificationsService.image(userId, notificationId, 0)).resolves.toMatchObject({
    name: 'test.png',
  });
  expect(mocks.findReadableImageMessage).toHaveBeenCalledWith(userId, notificationId, false);
});
