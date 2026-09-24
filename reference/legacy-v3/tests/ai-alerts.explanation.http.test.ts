import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findLatestExplanationMock } = vi.hoisted(() => ({
  findLatestExplanationMock: vi.fn(),
}));

vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { findLatestExplanation: findLatestExplanationMock },
}));

import { createApp } from '../src/app.js';

const alertId = '00000000-0000-4000-8000-000000000010';
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

describe('AI decision explanation HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findLatestExplanationMock.mockResolvedValue({
      exists: true,
      explanation: {
        ai_alert_explanation_id: '00000000-0000-4000-8000-000000000020',
        ai_alert_id: alertId,
        explanation_text: 'Sign-ins exceeded the normal baseline.',
        feature_contributions: { failedSignIns: 5 },
        baseline_data: { normalFailedSignIns: 1 },
        created_at: new Date('2026-09-13T00:00:00Z'),
      },
    });
  });

  it('returns the stored explanation through a read-protected endpoint', async () => {
    const response = await request(createApp())
      .get(`/api/v1/ai-alerts/${alertId}/explanation`)
      .set('authorization', `Bearer ${token(['ai-alerts.read'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        alertId,
        explanationText: 'Sign-ins exceeded the normal baseline.',
        featureContributions: { failedSignIns: 5 },
        baselineData: { normalFailedSignIns: 1 },
      },
    });
  });

  it('returns null when the alert has no explanation and 404 when the alert is absent', async () => {
    findLatestExplanationMock.mockResolvedValueOnce({ exists: true, explanation: null });
    const empty = await request(createApp())
      .get(`/api/v1/ai-alerts/${alertId}/explanation`)
      .set('authorization', `Bearer ${token(['ai-alerts.read'])}`);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ success: true, data: null });

    findLatestExplanationMock.mockResolvedValueOnce({ exists: false, explanation: null });
    const missing = await request(createApp())
      .get(`/api/v1/ai-alerts/${alertId}/explanation`)
      .set('authorization', `Bearer ${token(['ai-alerts.read'])}`);
    expect(missing.status).toBe(404);
  });

  it('requires authentication, permission, and a valid alert ID', async () => {
    expect((await request(createApp()).get(`/api/v1/ai-alerts/${alertId}/explanation`)).status).toBe(401);
    expect(
      (await request(createApp())
        .get(`/api/v1/ai-alerts/${alertId}/explanation`)
        .set('authorization', `Bearer ${token([])}`)).status,
    ).toBe(403);
    expect(
      (await request(createApp())
        .get('/api/v1/ai-alerts/not-a-uuid/explanation')
        .set('authorization', `Bearer ${token(['ai-alerts.read'])}`)).status,
    ).toBe(422);
    expect(findLatestExplanationMock).not.toHaveBeenCalled();
  });
});
