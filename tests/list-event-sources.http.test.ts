import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/event-sources.service.js', () => ({
  eventSourcesService: {
    registerEventSource: vi.fn(),
    listEventSources: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { eventSourcesService } from '../src/modules/event-ingestion/event-sources.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('GET /api/v1/event-sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/event-sources');
    expect(response.status).toBe(401);
  });

  it('returns paginated event sources and 200', async () => {
    const mockListResult = {
      items: [
        {
          id: 'src-1234',
          name: 'Wazuh Production',
          sourceType: 'WAZUH',
          endpoint: 'https://wazuh.corp:55000',
          ingestionMethod: 'API' as const,
          authenticationType: 'BEARER_TOKEN',
          status: 'ACTIVE' as const,
          description: 'Production SIEM',
          eventFamilies: ['AUTHENTICATION' as const, 'VPN_SSO' as const],
          createdBy: userId,
          createdAt: new Date('2026-09-27T10:00:00Z'),
          updatedAt: new Date('2026-09-27T10:00:00Z'),
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    };

    vi.mocked(eventSourcesService.listEventSources).mockResolvedValue(mockListResult);

    const response = await request(app)
      .get('/api/v1/event-sources?page=1&limit=20&q=Wazuh')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      id: 'src-1234',
      name: 'Wazuh Production',
      sourceType: 'WAZUH',
    });
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('rejects invalid query with 422', async () => {
    const response = await request(app)
      .get('/api/v1/event-sources?page=0')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(eventSourcesService.listEventSources).not.toHaveBeenCalled();
  });
});
