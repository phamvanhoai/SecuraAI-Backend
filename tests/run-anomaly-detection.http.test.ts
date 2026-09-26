import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.service.js', () => ({
  anomalyDetectionService: { run: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { anomalyDetectionService } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();
const token = jwt.sign({ type: 'access', role: 'SECURITY_OFFICER' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('POST /api/v1/anomaly-detections/runs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).post('/api/v1/anomaly-detections/runs').send({});
    expect(response.status).toBe(401);
  });

  it('validates and returns the persisted run summary', async () => {
    vi.mocked(anomalyDetectionService.run).mockResolvedValue({
      modelVersionId: '00000000-0000-4000-8000-000000000001',
      modelName: 'detector',
      modelVersion: '2',
      lookbackHours: 24,
      eventsEvaluated: 1,
      anomaliesDetected: 1,
      customThresholdsApplied: 0,
      detectionsCreated: 1,
      alertsCreated: 1,
      threshold: 0.8,
      completedAt: '2026-09-25T00:00:00.000Z',
    });
    const response = await request(app)
      .post('/api/v1/anomaly-detections/runs')
      .set('Authorization', `Bearer ${token}`)
      .send({ lookbackHours: 24, maxEvents: 100 });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ eventsEvaluated: 1, alertsCreated: 1 });
    expect(anomalyDetectionService.run).toHaveBeenCalledWith(
      userId,
      { lookbackHours: 24, maxEvents: 100 },
      expect.any(String),
    );
  });
});
