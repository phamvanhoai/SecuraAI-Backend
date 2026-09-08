import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const { listAlertsMock } = vi.hoisted(() => ({ listAlertsMock: vi.fn() }));

vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    listAlerts: listAlertsMock,
  },
}));

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

describe('real-time AI alert HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAlertsMock.mockResolvedValue({ items: [], total: 0 });
  });

  it('requires authentication and read permission', async () => {
    expect((await request(createApp()).get('/api/v1/ai-alerts')).status).toBe(401);
    const forbidden = await request(createApp())
      .get('/api/v1/ai-alerts')
      .set('authorization', `Bearer ${token([])}`);
    expect(forbidden.status).toBe(403);
    expect(listAlertsMock).not.toHaveBeenCalled();
  });

  it('normalizes polling filters and returns a server watermark', async () => {
    const response = await request(createApp())
      .get(
        '/api/v1/ai-alerts?limit=10&status=new&logSourceId=00000000-0000-4000-8000-000000000010&detectedAfter=2026-09-08T00:00:00Z',
      )
      .set('authorization', `Bearer ${token(['ai-alerts.read'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } },
    });
    const responseBody: unknown = response.body;
    const data = isRecord(responseBody) ? responseBody['data'] : null;
    const serverTime = isRecord(data) ? data['serverTime'] : null;
    expect(typeof serverTime).toBe('string');
    if (typeof serverTime === 'string') {
      expect(new Date(serverTime).toString()).not.toBe('Invalid Date');
    }
    const queryArgument: unknown = listAlertsMock.mock.calls[0]?.[0];
    expect(queryArgument).toMatchObject({ limit: 10, status: 'new' });
    expect(
      typeof queryArgument === 'object' && queryArgument !== null
        ? Reflect.get(queryArgument, 'detectedAfter')
        : null,
    ).toBeInstanceOf(Date);
  });

  it('rejects invalid or unbounded polling queries', async () => {
    const response = await request(createApp())
      .get('/api/v1/ai-alerts?limit=101&detectedAfter=not-a-date')
      .set('authorization', `Bearer ${token(['ai-alerts.read'])}`);
    expect(response.status).toBe(422);
    expect(listAlertsMock).not.toHaveBeenCalled();
  });
});
