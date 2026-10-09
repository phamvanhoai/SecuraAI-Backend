import { beforeEach, describe, expect, it, vi } from 'vitest';

const notificationId = '22222222-2222-4222-8222-222222222222';
const recipientId = '11111111-1111-4111-8111-111111111111';
const deliveryId = '33333333-3333-4333-8333-333333333333';
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  tx: {
    users: { findUnique: vi.fn(), findMany: vi.fn() },
    notifications: { create: vi.fn() },
    notification_recipients: { createMany: vi.fn(), findMany: vi.fn() },
    notification_deliveries: { createMany: vi.fn() },
    audit_logs: { create: vi.fn() },
  },
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: mocks.transaction },
}));
import { notificationsRepository } from '../src/modules/notification-system-logs/notifications.repository.js';

describe('in-system notification repository', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.users.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' });
    mocks.tx.users.findMany.mockResolvedValue([{ id: recipientId }]);
    mocks.tx.notifications.create.mockResolvedValue({
      id: notificationId,
      created_at: new Date('2026-10-08T15:00:00.000Z'),
    });
    mocks.tx.notification_recipients.findMany.mockResolvedValue([{ id: deliveryId }]);
  });

  it('uses one timestamp for creation and delivery so the database check cannot race', async () => {
    await notificationsRepository.create(
      recipientId,
      {
        title: 'Review required',
        message: 'Review the latest finding.',
        priority: 'IMPORTANT',
        audience: { type: 'users', userIds: [recipientId] },
      },
      [recipientId],
    );

    const delivery = mocks.tx.notification_deliveries.createMany.mock.calls[0]?.[0].data[0];
    expect(delivery).toMatchObject({
      notification_recipient_id: deliveryId,
      channel: 'IN_SYSTEM',
      status: 'DELIVERED',
    });
    expect(delivery.created_at).toBe(delivery.sent_at);
    expect(delivery.created_at).toBe(delivery.delivered_at);
    expect(delivery.created_at).toBe(delivery.updated_at);
  });
});
