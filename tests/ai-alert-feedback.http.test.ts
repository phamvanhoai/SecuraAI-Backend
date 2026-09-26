import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js', () => ({
  aiAlertsService: { list: vi.fn(), createFeedback: vi.fn(), listFeedback: vi.fn() },
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

describe('/api/v1/ai-alerts/:alertId/feedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).post(`/api/v1/ai-alerts/${alertId}/feedback`)).status).toBe(401);
  });

  it('creates validated feedback', async () => {
    vi.mocked(aiAlertsService.createFeedback).mockResolvedValue({
      id: userId,
      alertId,
      reviewedByUserId: userId,
      feedbackLabel: 'needs_review',
      comment: 'Investigate',
      createdAt: new Date('2026-09-25T00:00:00Z'),
    });
    const response = await request(app)
      .post(`/api/v1/ai-alerts/${alertId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ feedbackLabel: 'needs_review', comment: 'Investigate' });
    expect(response.status).toBe(201);
    expect(aiAlertsService.createFeedback).toHaveBeenCalledWith(userId, alertId, {
      feedbackLabel: 'needs_review',
      comment: 'Investigate',
    });
  });

  it('lists paginated feedback history', async () => {
    vi.mocked(aiAlertsService.listFeedback).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get(`/api/v1/ai-alerts/${alertId}/feedback`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.pagination.total).toBe(0);
  });

  it('rejects malformed alert ids and bodies', async () => {
    const response = await request(app)
      .post('/api/v1/ai-alerts/not-a-uuid/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ feedbackLabel: 'accurate' });
    expect(response.status).toBe(422);
    expect(aiAlertsService.createFeedback).not.toHaveBeenCalled();
  });
});
