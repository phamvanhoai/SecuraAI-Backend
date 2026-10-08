import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  findActor: vi.fn(),
  findPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));
vi.mock('../src/modules/notification-system-logs/notifications.repository.js', () => ({
  notificationsRepository: repository,
}));
vi.mock('../src/modules/notification-system-logs/notification-email.service.js', () => ({
  notificationEmailService: { ensureConfigured: vi.fn(), send: vi.fn() },
}));

import { notificationsService } from '../src/modules/notification-system-logs/notifications.service.js';

const userId = '00000000-0000-4000-8000-000000000001';

describe('personal notification preferences service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.findActor.mockResolvedValue({ id: userId, status: 'ACTIVE', role: 'EMPLOYEE' });
  });

  it('returns enabled defaults before the user saves preferences', async () => {
    repository.findPreferences.mockResolvedValue([]);
    await expect(notificationsService.getPreferences(userId)).resolves.toEqual({
      channels: { inSystem: true, email: true },
      updatedAt: null,
    });
  });

  it('maps stored channel preferences', async () => {
    repository.findPreferences.mockResolvedValue([
      { channel: 'EMAIL', enabled: false, updated_at: new Date('2026-10-08T06:00:00.000Z') },
      { channel: 'IN_SYSTEM', enabled: true, updated_at: new Date('2026-10-08T07:00:00.000Z') },
    ]);
    await expect(notificationsService.getPreferences(userId)).resolves.toEqual({
      channels: { inSystem: true, email: false },
      updatedAt: '2026-10-08T07:00:00.000Z',
    });
  });

  it('updates preferences for an active user', async () => {
    const input = { channels: { inSystem: false, email: true } };
    repository.updatePreferences.mockResolvedValue({
      kind: 'updated',
      preferences: [],
      updatedAt: new Date('2026-10-08T08:00:00.000Z'),
    });
    await expect(notificationsService.updatePreferences(userId, input)).resolves.toEqual({
      ...input,
      updatedAt: '2026-10-08T08:00:00.000Z',
    });
  });
});
