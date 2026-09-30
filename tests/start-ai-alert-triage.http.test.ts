import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js', () => ({
  aiAlertsService: { startTriage: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const alertId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('POST /api/v1/ai-alerts/:alertId/triage/start', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).post(`/api/v1/ai-alerts/${alertId}/triage/start`)).status).toBe(401);
  });

  it('starts analyst triage', async () => {
    vi.mocked(aiAlertsService.startTriage).mockResolvedValue({
      id: alertId,
      alertCode: 'ALT-C82662FF',
      status: 'reviewing',
      assignedToUserId: userId,
      triageStartedAt: new Date('2026-10-01T00:00:00Z'),
      changed: true,
    });
    const response = await request(app)
      .post(`/api/v1/ai-alerts/${alertId}/triage/start`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'reviewing', changed: true });
  });

  it('rejects an invalid alert ID before the service', async () => {
    const response = await request(app)
      .post('/api/v1/ai-alerts/not-a-uuid/triage/start')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(aiAlertsService.startTriage).not.toHaveBeenCalled();
  });
});
