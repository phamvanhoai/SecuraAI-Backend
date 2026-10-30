import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js', () => ({
  aiAlertsService: { list: vi.fn(), getExplanation: vi.fn(), regenerateExplanation: vi.fn() },
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

describe('POST /api/v1/ai-alerts/:alertId/explanation/regenerate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates the reason before invoking regeneration', async () => {
    const response = await request(app)
      .post(`/api/v1/ai-alerts/${alertId}/explanation/regenerate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'short' });
    expect(response.status).toBe(422);
    expect(aiAlertsService.regenerateExplanation).not.toHaveBeenCalled();
  });

  it('regenerates a stored explanation', async () => {
    vi.mocked(aiAlertsService.regenerateExplanation).mockResolvedValue({
      id: userId,
      alertId,
      explanationText: 'Updated explanation.',
      featureContributions: [],
      baselineData: {
        correlatedEventCount: 1,
        anomalyScore: 0.82,
        threshold: 0.7,
        scoreAboveThreshold: 0.12,
        suggestedRiskLevel: 'high',
        detectedAt: new Date('2026-10-27T11:00:00Z'),
      },
      createdAt: new Date('2026-10-27T12:00:00Z'),
    });
    const response = await request(app)
      .post(`/api/v1/ai-alerts/${alertId}/explanation/regenerate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Review explanation accuracy' });
    expect(response.status).toBe(200);
    expect(response.body.data.explanationText).toBe('Updated explanation.');
    expect(aiAlertsService.regenerateExplanation).toHaveBeenCalledWith(
      userId,
      alertId,
      { reason: 'Review explanation accuracy' },
      expect.any(Object),
    );
  });
});

describe('GET /api/v1/ai-alerts/:alertId/explanation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).get(`/api/v1/ai-alerts/${alertId}/explanation`)).status).toBe(401);
  });

  it('returns the AI explanation and suggested risk level', async () => {
    vi.mocked(aiAlertsService.getExplanation).mockResolvedValue({
      id: userId,
      alertId,
      explanationText: 'Suggested risk level is high.',
      featureContributions: [],
      baselineData: {
        correlatedEventCount: 1,
        anomalyScore: 0.825,
        threshold: 0.7,
        scoreAboveThreshold: 0.125,
        suggestedRiskLevel: 'high',
        detectedAt: new Date('2026-09-26T00:00:00Z'),
      },
      createdAt: new Date('2026-09-26T00:00:00Z'),
    });
    const response = await request(app)
      .get(`/api/v1/ai-alerts/${alertId}/explanation`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.baselineData.suggestedRiskLevel).toBe('high');
  });

  it('rejects a malformed alert ID', async () => {
    const response = await request(app)
      .get('/api/v1/ai-alerts/not-a-uuid/explanation')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(aiAlertsService.getExplanation).not.toHaveBeenCalled();
  });
});
