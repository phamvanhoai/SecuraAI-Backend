import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { confirmAlertAsIncident: confirmMock },
}));
import { createApp } from '../src/app.js';

const alertId = '00000000-0000-4000-8000-000000000010';
const token = (permissions: string[]): string => jwt.sign(
  { type: 'access', roles: [], permissions },
  'test-secret-with-at-least-thirty-two-characters',
  { algorithm: 'HS256', subject: '00000000-0000-4000-8000-000000000001', issuer: 'securaai-api', audience: 'securaai-client', expiresIn: '15m' },
);

describe('confirm AI alert HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue({
      kind: 'confirmed',
      alert: {
        ai_alert_id: alertId, ai_alert_code: 'AI-1', alert_code: 'AI-1', status: 'confirmed',
        reviewed_by_user_id: '00000000-0000-4000-8000-000000000001', reviewed_at: new Date(),
      },
    });
  });

  it('requires authentication and confirmation permission', async () => {
    expect((await request(createApp()).post(`/api/v1/ai-alerts/${alertId}/confirm-incident`).send({})).status).toBe(401);
    expect((await request(createApp()).post(`/api/v1/ai-alerts/${alertId}/confirm-incident`).set('authorization', `Bearer ${token([])}`).send({})).status).toBe(403);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('confirms a valid alert', async () => {
    const response = await request(createApp())
      .post(`/api/v1/ai-alerts/${alertId}/confirm-incident`)
      .set('authorization', `Bearer ${token(['ai-alerts.confirm'])}`)
      .send({ comment: 'Verified by analyst' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { id: alertId, status: 'confirmed', changed: true } });
  });

  it('rejects malformed IDs before database access', async () => {
    const response = await request(createApp())
      .post('/api/v1/ai-alerts/not-a-uuid/confirm-incident')
      .set('authorization', `Bearer ${token(['ai-alerts.confirm'])}`)
      .send({});
    expect(response.status).toBe(422);
    expect(confirmMock).not.toHaveBeenCalled();
  });
});
