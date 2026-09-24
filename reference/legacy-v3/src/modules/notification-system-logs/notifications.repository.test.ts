import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { notificationsRepository } from './notifications.repository.js';

describe('atomic idempotent in-app delivery', () => {
  it.each([0, 1])('records a delivery only when insert count is %i', async (count) => {
    const createMany = vi.fn().mockResolvedValue({ count });
    const delivery = vi.fn();
    const tx = {
      notifications: { createMany },
      notification_deliveries: { create: delivery },
    } as unknown as Prisma.TransactionClient;
    const now = new Date();
    const data = {
      notification_id: 'id',
      user_id: 'employee',
      type: 'training_deadline_3d',
      title: 'Reminder',
      message: 'Complete training',
      created_at: now,
    };
    expect(await notificationsRepository.createTrainingReminder(tx, data)).toBe(count === 1);
    expect(createMany).toHaveBeenCalledWith({ data: [data], skipDuplicates: true });
    expect(delivery).toHaveBeenCalledTimes(count);
    if (count)
      expect(delivery).toHaveBeenCalledWith({
        data: { notification_id: 'id', channel: 'in_app', status: 'delivered', sent_at: now },
      });
  });
});
