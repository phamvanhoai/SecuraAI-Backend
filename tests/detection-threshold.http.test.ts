import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js', () => ({
  aiAlertsService: { getDetectionThreshold: vi.fn(), configureDetectionThreshold: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const modelVersionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', subject: userId,
  expiresIn: '15m',
});
const thresholdResponse = {
  modelVersionId, modelName: 'Secura Detector', version: '2.0', status: 'deployed',
  threshold: 0.82, deployedAt: new Date('2026-09-25T00:00:00Z'),
};

describe('/api/v1/ai-alerts/thresholds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/ai-alerts/thresholds')).status).toBe(401);
  });

  it('returns the deployed model threshold', async () => {
    vi.mocked(aiAlertsService.getDetectionThreshold).mockResolvedValue(thresholdResponse);
    const result = await request(app).get('/api/v1/ai-alerts/thresholds').set('Authorization', `Bearer ${token}`);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ modelVersionId, threshold: 0.82 });
  });

  it('validates and updates the threshold', async () => {
    vi.mocked(aiAlertsService.configureDetectionThreshold).mockResolvedValue(thresholdResponse);
    const invalid = await request(app).put('/api/v1/ai-alerts/thresholds').set('Authorization', `Bearer ${token}`).send({ threshold: 0.2 });
    expect(invalid.status).toBe(422);
    expect(aiAlertsService.configureDetectionThreshold).not.toHaveBeenCalled();
    const valid = await request(app).put('/api/v1/ai-alerts/thresholds').set('Authorization', `Bearer ${token}`).send({ threshold: 0.82 });
    expect(valid.status).toBe(200);
  });
});
