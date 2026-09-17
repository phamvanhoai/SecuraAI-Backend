import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { createApp } from '../../app.js';
import type * as NotificationsModule from '../notifications/index.js';

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), list: vi.fn(), read: vi.fn() }));
vi.mock('./training-reminders.service.js', () => ({
  trainingRemindersService: { dispatch: mocks.dispatch },
}));
vi.mock('../notifications/index.js', async (original) => ({
  ...(await original<typeof NotificationsModule>()),
  notificationsService: { listTrainingReminders: mocks.list, markTrainingReminderRead: mocks.read },
}));
const app = createApp();
const secret = env.CRON_SECRET;
const enabled = env.TRAINING_REMINDERS_ENABLED;
const token = (permissions: string[]) =>
  jwt.sign({ type: 'access', roles: ['EMPLOYEE'], permissions }, env.JWT_ACCESS_SECRET, {
    subject: '00000000-0000-4000-8000-000000000001',
    issuer: 'securaai-api',
    audience: 'securaai-client',
    expiresIn: '1m',
  });
describe('training reminder route security', () => {
  afterEach(() => {
    env.CRON_SECRET = secret;
    env.TRAINING_REMINDERS_ENABLED = enabled;
    vi.clearAllMocks();
  });
  it('fails closed when external scheduler is not configured', async () => {
    env.CRON_SECRET = undefined;
    const result = await request(app).get('/api/v1/training/deadline-reminders/dispatch');
    expect(result.status).toBe(503);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('rejects employee JWTs for dispatch but accepts the scheduler secret', async () => {
    env.CRON_SECRET = 'test-cron-secret-at-least-32-characters';
    expect(
      (
        await request(app)
          .get('/api/v1/training/deadline-reminders/dispatch')
          .auth(token(['training-assessments.take']), { type: 'bearer' })
      ).status,
    ).toBe(401);
    mocks.dispatch.mockResolvedValue({ delivered: 1, processed: 1, hasMore: false });
    const result = await request(app)
      .get('/api/v1/training/deadline-reminders/dispatch')
      .auth(env.CRON_SECRET, { type: 'bearer' });
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toContain('no-store');
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });
  it('requires authentication and employee permission for the inbox', async () => {
    expect((await request(app).get('/api/v1/training/deadline-reminders')).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/training/deadline-reminders')
          .auth(token([]), { type: 'bearer' })
      ).status,
    ).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('validates bounded filters before database access', async () => {
    expect(
      (
        await request(app)
          .get('/api/v1/training/deadline-reminders?limit=1000')
          .auth(token(['training-assessments.take']), { type: 'bearer' })
      ).status,
    ).toBe(422);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
