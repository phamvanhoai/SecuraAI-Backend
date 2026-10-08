import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/modules/access-control/access-control.service.js', () => ({
  accessControlService: { hasPermission: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../src/modules/notification-system-logs/notifications.service.js', () => ({
  notificationsService: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    send: vi.fn(),
    sendEmail: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { notificationsService } from '../src/modules/notification-system-logs/notifications.service.js';

const userId = '00000000-0000-4000-8000-000000000001';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
});

describe('/api/v1/notifications/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/notifications/preferences')).status).toBe(401);
  });

  it('returns the authenticated user preferences', async () => {
    vi.mocked(notificationsService.getPreferences).mockResolvedValue({
      channels: { inSystem: true, email: false },
      updatedAt: '2026-10-08T07:00:00.000Z',
    });
    const response = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.channels).toEqual({ inSystem: true, email: false });
    expect(notificationsService.getPreferences).toHaveBeenCalledWith(userId);
  });

  it('validates and updates the authenticated user preferences', async () => {
    vi.mocked(notificationsService.updatePreferences).mockResolvedValue({
      channels: { inSystem: false, email: true },
      updatedAt: '2026-10-08T08:00:00.000Z',
    });
    const response = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ channels: { inSystem: false, email: true } });
    expect(response.status).toBe(200);
    expect(notificationsService.updatePreferences).toHaveBeenCalledWith(userId, {
      channels: { inSystem: false, email: true },
    });
  });

  it('rejects disabling every channel', async () => {
    const response = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ channels: { inSystem: false, email: false } });
    expect(response.status).toBe(422);
    expect(notificationsService.updatePreferences).not.toHaveBeenCalled();
  });
});
