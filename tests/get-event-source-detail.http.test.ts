import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/event-sources.service.js', () => ({
  eventSourcesService: {
    registerEventSource: vi.fn(),
    listEventSources: vi.fn(),
    getEventSourceDetail: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { eventSourcesService } from '../src/modules/event-ingestion/event-sources.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const sourceId = '3a9bf33a-02db-48e4-a8ad-90517278d7f3';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('GET /api/v1/event-sources/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication and returns 401', async () => {
    const response = await request(app).get(`/api/v1/event-sources/${sourceId}`);
    expect(response.status).toBe(401);
  });

  it('returns 200 with comprehensive event source details', async () => {
    const mockDetail = {
      id: sourceId,
      name: 'Wazuh Production',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.internal:55000',
      ingestionMethod: 'API' as const,
      authenticationType: 'API_KEY',
      status: 'ACTIVE' as const,
      description: 'Production cluster',
      eventFamilies: ['AUTHENTICATION' as const],
      createdBy: userId,
      creator: {
        id: userId,
        email: 'admin@secura.ai',
        fullName: 'Admin User',
      },
      apiKeys: [
        {
          id: 'key-1',
          name: 'Primary Ingestion Key',
          keyPrefix: 'sec_live_123456',
          maskedKey: 'sec_live_123456...****',
          status: 'ACTIVE' as const,
          expiresAt: null,
          lastUsedAt: new Date('2026-09-28T14:00:00Z'),
          lastUsedIp: '127.0.0.1',
          createdAt: new Date('2026-09-20T10:00:00Z'),
        },
      ],
      stats: {
        totalIngestedEvents: 5000,
        totalBatches: 50,
        lastIngestedAt: new Date('2026-09-28T14:00:00Z'),
      },
      createdAt: new Date('2026-09-20T10:00:00Z'),
      updatedAt: new Date('2026-09-27T12:00:00Z'),
    };

    vi.mocked(eventSourcesService.getEventSourceDetail).mockResolvedValue(mockDetail);

    const response = await request(app)
      .get(`/api/v1/event-sources/${sourceId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: sourceId,
      name: 'Wazuh Production',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.internal:55000',
      ingestionMethod: 'API',
    });
    expect(response.body.data.apiKeys[0].maskedKey).toBe('sec_live_123456...****');
    expect(response.body.data.stats.totalIngestedEvents).toBe(5000);
    expect(eventSourcesService.getEventSourceDetail).toHaveBeenCalledWith(userId, sourceId);
  });

  it('rejects invalid UUID parameter with 422', async () => {
    const response = await request(app)
      .get('/api/v1/event-sources/not-a-valid-uuid')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(eventSourcesService.getEventSourceDetail).not.toHaveBeenCalled();
  });
});
