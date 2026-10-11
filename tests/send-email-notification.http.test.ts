import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/modules/access-control/access-control.service.js', () => ({
  accessControlService: { hasPermission: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../src/modules/notification-system-logs/notifications.service.js', () => ({
  notificationsService: { send: vi.fn(), sendEmail: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { notificationsService } from '../src/modules/notification-system-logs/notifications.service.js';

const actorUserId = '00000000-0000-4000-8000-000000000001';
const recipientUserId = '00000000-0000-4000-8000-000000000002';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: actorUserId,
});

describe('POST /api/v1/notifications/email', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).post('/api/v1/notifications/email').send({});
    expect(response.status).toBe(401);
  });

  it('validates, sends and reports delivery counts', async () => {
    vi.mocked(notificationsService.sendEmail).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      recipientCount: 1,
      sentCount: 1,
      failedCount: 0,
      queuedAt: '2026-10-08T06:00:00.000Z',
    });

    const response = await request(app)
      .post('/api/v1/notifications/email')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: 'Security review required',
        message: 'Please review the latest finding.',
        userIds: [recipientUserId],
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        recipientCount: 1,
        sentCount: 1,
        failedCount: 0,
        queuedAt: '2026-10-08T06:00:00.000Z',
      },
    });
    expect(notificationsService.sendEmail).toHaveBeenCalledWith(actorUserId, {
      subject: 'Security review required',
      message: 'Please review the latest finding.',
      userIds: [recipientUserId],
    });
  });

  it('deduplicates recipients before the service', async () => {
    vi.mocked(notificationsService.sendEmail).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      recipientCount: 1,
      sentCount: 1,
      failedCount: 0,
      queuedAt: '2026-10-08T06:00:00.000Z',
    });
    const response = await request(app)
      .post('/api/v1/notifications/email')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: 'Security review required',
        message: 'Please review the latest finding.',
        userIds: [recipientUserId, recipientUserId],
      });

    expect(response.status).toBe(201);
    expect(notificationsService.sendEmail).toHaveBeenCalledWith(actorUserId, {
      subject: 'Security review required',
      message: 'Please review the latest finding.',
      userIds: [recipientUserId],
    });
  });
});
