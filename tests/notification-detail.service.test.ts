import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findActor: vi.fn(), findInboxItem: vi.fn() }));
vi.mock('../src/modules/notification-system-logs/notifications.repository.js', () => ({ notificationsRepository: mocks }));
import { notificationsService } from '../src/modules/notification-system-logs/notifications.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findActor.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
});
it('returns own details and image references without changing read state', async () => {
  mocks.findInboxItem.mockResolvedValue({ id: 'recipient', read_at: null, notification: {
    id: 'message', title: 'Update', message: 'See image', priority: 'NORMAL', created_at: new Date('2026-10-30T00:00:00Z'),
    sender: { full_name: 'Admin', email: 'admin@example.test' },
    image_references: [{ id: '11111111-1111-4111-8111-111111111111', name: 'image.png', sha256: 'a'.repeat(64) }],
  } });
  await expect(notificationsService.detail('actor', 'recipient')).resolves.toMatchObject({
    id: 'recipient', message: 'See image', images: [{ name: 'image.png', index: 0 }], readAt: null,
  });
  expect(mocks.findInboxItem).toHaveBeenCalledWith('actor', 'recipient');
});
it('does not reveal another recipient notification', async () => {
  mocks.findInboxItem.mockResolvedValue(null);
  await expect(notificationsService.detail('actor', 'other')).rejects.toMatchObject({ statusCode: 404 });
});
it('requires an active account before looking up details', async () => {
  mocks.findActor.mockResolvedValue({ status: 'INACTIVE' });
  await expect(notificationsService.detail('actor', 'recipient')).rejects.toMatchObject({ statusCode: 401 });
  expect(mocks.findInboxItem).not.toHaveBeenCalled();
});
