import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { evaluateMock, listMock } = vi.hoisted(() => ({
  evaluateMock: vi.fn(),
  listMock: vi.fn(),
}));
vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    evaluateAlertReliability: evaluateMock,
    listAlertFeedback: listMock,
  },
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

describe('AI alert reliability HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateMock.mockResolvedValue({
      ai_feedback_id: 'feedback-1',
      ai_alert_id: alertId,
      reviewed_by_user_id: '00000000-0000-4000-8000-000000000001',
      feedback_label: 'needs_review',
      comment: null,
      created_at: new Date(),
    });
    listMock.mockResolvedValue({
      exists: true,
      items: [
        {
          ai_feedback_id: '00000000-0000-4000-8000-000000000020',
          ai_alert_id: alertId,
          reviewed_by_user_id: '00000000-0000-4000-8000-000000000001',
          feedback_label: 'needs_review',
          comment: null,
          created_at: new Date('2026-09-13T00:00:00Z'),
        },
      ],
      total: 1,
    });
  });

  it('returns paginated feedback history', async () => {
    const response = await request(createApp())
      .get(`/api/v1/ai-alerts/${alertId}/feedback?page=1&limit=10`)
      .set('authorization', `Bearer ${token(['ai-alerts.feedback'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        items: [{ alertId, feedbackLabel: 'needs_review' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });
  });

  it('requires authentication and feedback permission', async () => {
    expect(
      (
        await request(createApp())
          .post(`/api/v1/ai-alerts/${alertId}/feedback`)
          .send({ feedbackLabel: 'needs_review' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(createApp())
          .post(`/api/v1/ai-alerts/${alertId}/feedback`)
          .set('authorization', `Bearer ${token([])}`)
          .send({ feedbackLabel: 'needs_review' })
      ).status,
    ).toBe(403);
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it('records valid feedback and returns the standard response', async () => {
    const response = await request(createApp())
      .post(`/api/v1/ai-alerts/${alertId}/feedback`)
      .set('authorization', `Bearer ${token(['ai-alerts.feedback'])}`)
      .send({ feedbackLabel: 'needs_review', comment: 'Verify manually' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { alertId, feedbackLabel: 'needs_review' },
    });
  });

  it('rejects malformed IDs and payloads before database access', async () => {
    const response = await request(createApp())
      .post('/api/v1/ai-alerts/not-a-uuid/feedback')
      .set('authorization', `Bearer ${token(['ai-alerts.feedback'])}`)
      .send({ feedbackLabel: 'unknown' });
    expect(response.status).toBe(422);
    expect(evaluateMock).not.toHaveBeenCalled();
  });
});
