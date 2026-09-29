import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/event-sources.service.js', () => ({
  eventSourcesService: {
    registerEventSource: vi.fn(),
    listEventSources: vi.fn(),
    getEventSourceDetail: vi.fn(),
    updateEventSource: vi.fn(),
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

describe('PUT /api/v1/event-sources/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication and returns 401', async () => {
    const response = await request(app)
      .put(`/api/v1/event-sources/${sourceId}`)
      .send({ name: 'New Name' });
    expect(response.status).toBe(401);
  });

  it('validates UUID params and returns 422 for invalid format', async () => {
    const response = await request(app)
      .put('/api/v1/event-sources/invalid-uuid')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });
    expect(response.status).toBe(422);
  });

  it('returns 200 with updated event source details on valid request', async () => {
    const mockUpdated = {
      id: sourceId,
      name: 'Wazuh Updated Name',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.internal:55000',
      ingestionMethod: 'API' as const,
      authenticationType: 'API_KEY',
      status: 'ACTIVE' as const,
      description: 'Updated operational notes',
      eventFamilies: ['AUTHENTICATION' as const],
      createdBy: userId,
      createdAt: new Date('2026-09-20T10:00:00Z'),
      updatedAt: new Date('2026-09-29T14:00:00Z'),
    };

    vi.mocked(eventSourcesService.updateEventSource).mockResolvedValue(mockUpdated);

    const response = await request(app)
      .put(`/api/v1/event-sources/${sourceId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Wazuh Updated Name',
        description: 'Updated operational notes',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        ...mockUpdated,
        createdAt: mockUpdated.createdAt.toISOString(),
        updatedAt: mockUpdated.updatedAt.toISOString(),
      },
    });
  });

  it('supports PATCH method as well', async () => {
    const mockUpdated = {
      id: sourceId,
      name: 'Wazuh Patched Name',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.internal:55000',
      ingestionMethod: 'API' as const,
      authenticationType: 'API_KEY',
      status: 'INACTIVE' as const,
      description: 'Patched description',
      eventFamilies: ['AUTHENTICATION' as const],
      createdBy: userId,
      createdAt: new Date('2026-09-20T10:00:00Z'),
      updatedAt: new Date('2026-09-29T14:00:00Z'),
    };

    vi.mocked(eventSourcesService.updateEventSource).mockResolvedValue(mockUpdated);

    const response = await request(app)
      .patch(`/api/v1/event-sources/${sourceId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'INACTIVE',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('INACTIVE');
  });
});
