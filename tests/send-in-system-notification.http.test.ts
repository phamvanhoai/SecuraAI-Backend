import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/modules/access-control/access-control.service.js', () => ({
  accessControlService: { hasPermission: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../src/modules/notification-system-logs/notifications.service.js', () => ({
  notificationsService: { send: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { notificationsService } from '../src/modules/notification-system-logs/notifications.service.js';

const actorUserId = '00000000-0000-4000-8000-000000000001';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: actorUserId,
});

describe('POST /api/v1/notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).post('/api/v1/notifications').send({});
    expect(response.status).toBe(401);
  });

  it('validates and sends a notification', async () => {
    vi.mocked(notificationsService.send).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      recipientCount: 3,
      sentAt: '2026-10-08T06:00:00.000Z',
    });
    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Review required',
        message: 'Review the latest finding.',
        priority: 'IMPORTANT',
        audience: { type: 'roles', roles: ['SECURITY_OFFICER'] },
      });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        recipientCount: 3,
        sentAt: '2026-10-08T06:00:00.000Z',
      },
    });
    expect(notificationsService.send).toHaveBeenCalledWith(actorUserId, {
      title: 'Review required',
      message: 'Review the latest finding.',
      priority: 'IMPORTANT',
      audience: { type: 'roles', roles: ['SECURITY_OFFICER'] },
    });
  });

  it('rejects an empty audience before the service', async () => {
    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Review required',
        message: 'Review the latest finding.',
        priority: 'NORMAL',
        audience: { type: 'users', userIds: [] },
      });
    expect(response.status).toBe(422);
    expect(notificationsService.send).not.toHaveBeenCalled();
  });
});
