import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notificationId = '22222222-2222-4222-8222-222222222222';
const recipientId = '11111111-1111-4111-8111-111111111111';
const deliveryId = '33333333-3333-4333-8333-333333333333';
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    notification_preferences: { findMany: vi.fn(), upsert: vi.fn() },
    users: { findUnique: vi.fn(), findMany: vi.fn() },
    notifications: { create: vi.fn() },
    notification_recipients: { createMany: vi.fn(), findMany: vi.fn() },
    notification_deliveries: { createMany: vi.fn() },
    audit_logs: { create: vi.fn(), findFirst: vi.fn() },
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

    const audit = mocks.tx.audit_logs.create.mock.calls[0]?.[0].data;
    expect(audit.previous_hash).toBeUndefined();
    expect(audit.record_hash).toBe(
      createHash('sha256')
        .update(
          JSON.stringify({
            previousHash: null,
            actorUserId: recipientId,
            actorApiKeyId: null,
            actorType: 'USER',
            action: audit.action,
            resourceType: audit.resource_type,
            resourceId: audit.resource_id,
            outcome: 'SUCCESS',
            errorCode: null,
            beforeData: null,
            afterData: audit.after_data,
            occurredAt: audit.occurred_at.toISOString(),
          }),
        )
        .digest('hex'),
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

describe('personal notification preference audit snapshots', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.users.findUnique.mockResolvedValue({ status: 'ACTIVE' });
  });
  it('records previous channel values and new values within the write transaction', async () => {
    mocks.tx.notification_preferences.findMany.mockResolvedValue([
      { channel: 'IN_SYSTEM', enabled: true },
      { channel: 'EMAIL', enabled: false },
    ]);
    await notificationsRepository.updatePreferences(recipientId, {
      channels: { inSystem: false, email: true },
    });
    expect(mocks.tx.$queryRaw).toHaveBeenCalled();
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          before_data: { channels: { inSystem: true, email: false } },
          after_data: { channels: { inSystem: false, email: true } },
        }),
      }),
    );
    expect(mocks.tx.notification_preferences.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.notification_preferences.upsert.mock.invocationCallOrder[0] ?? Infinity,
    );
  });
  it('uses enabled defaults for channels with no stored preference', async () => {
    mocks.tx.notification_preferences.findMany.mockResolvedValue([]);
    await notificationsRepository.updatePreferences(recipientId, {
      channels: { inSystem: true, email: false },
    });
    expect(mocks.tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          before_data: { channels: { inSystem: true, email: true } },
        }),
      }),
    );
  });
});
