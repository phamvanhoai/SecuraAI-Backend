import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  users: { findUnique: vi.fn() },
  preferences: { findMany: vi.fn(), upsert: vi.fn() },
  audit: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { notificationsRepository } from '../src/modules/notification-system-logs/notifications.repository.js';

describe('notification preferences repository', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        callback({
          $queryRaw: mocks.queryRaw,
          users: mocks.users,
          notification_preferences: mocks.preferences,
          audit_logs: mocks.audit,
        }),
    );
    mocks.users.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    mocks.preferences.findMany.mockResolvedValue([]);
    mocks.preferences.upsert.mockResolvedValue({ id: 'preference' });
    mocks.audit.findFirst.mockResolvedValue(null);
    mocks.audit.create.mockResolvedValue({ id: 'audit' });
  });

  it('atomically upserts both supported channels and appends an audit record', async () => {
    const result = await notificationsRepository.updatePreferences(
      '00000000-0000-4000-8000-000000000001',
      { channels: { inSystem: true, email: false } },
    );

    expect(result.kind).toBe('updated');
    expect(mocks.preferences.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.preferences.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({ channel: 'IN_SYSTEM', enabled: true }),
      }),
    );
    expect(mocks.preferences.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({ channel: 'EMAIL', enabled: false }),
      }),
    );
    expect(mocks.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PERSONAL_NOTIFICATION_PREFERENCES_UPDATED' }),
      }),
    );
  });
});
