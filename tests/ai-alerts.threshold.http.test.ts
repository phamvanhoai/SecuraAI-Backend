import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listAlertThresholds: vi.fn(), setAlertThreshold: vi.fn() }));
vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({ aiAlertsRepository: mocks }));

import { createApp } from '../src/app.js';

const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: [], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

describe('custom alert threshold HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAlertThresholds.mockResolvedValue({ items: [], total: 0 });
  });

  it('requires authentication and threshold-management permission', async () => {
    expect((await request(createApp()).get('/api/v1/ai-alerts/thresholds')).status).toBe(401);
    expect(
      (
        await request(createApp())
          .get('/api/v1/ai-alerts/thresholds')
          .set('authorization', `Bearer ${token([])}`)
      ).status,
    ).toBe(403);
  });

  it('returns a bounded paginated threshold list', async () => {
    const response = await request(createApp())
      .get('/api/v1/ai-alerts/thresholds?page=1&limit=20')
      .set('authorization', `Bearer ${token(['ai-alerts.thresholds.manage'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    });
  });

  it('rejects invalid threshold bodies before database access', async () => {
    const response = await request(createApp())
      .put('/api/v1/ai-alerts/thresholds/00000000-0000-4000-8000-000000000002')
      .set('authorization', `Bearer ${token(['ai-alerts.thresholds.manage'])}`)
      .send({ threshold: 2 });
    expect(response.status).toBe(422);
    expect(mocks.setAlertThreshold).not.toHaveBeenCalled();
  });
});
