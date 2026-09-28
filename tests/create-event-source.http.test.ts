import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/event-sources.service.js', () => ({
  eventSourcesService: { registerEventSource: vi.fn() },
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

describe('POST /api/v1/event-sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .post('/api/v1/event-sources')
      .send({
        name: 'Wazuh SIEM',
        sourceType: 'WAZUH',
        endpoint: 'https://wazuh.local',
        ingestionMethod: 'API',
        eventFamilies: ['AUTHENTICATION'],
      });

    expect(response.status).toBe(401);
  });

  it('registers a normalized event source and returns 201', async () => {
    const mockCreated = {
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
    };

    vi.mocked(eventSourcesService.registerEventSource).mockResolvedValue(mockCreated);

    const response = await request(app)
      .post('/api/v1/event-sources')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Wazuh Production',
        sourceType: 'WAZUH',
        endpoint: 'https://wazuh.corp:55000',
        ingestionMethod: 'API',
        authenticationType: 'BEARER_TOKEN',
        status: 'ACTIVE',
        description: 'Production SIEM',
        eventFamilies: ['AUTHENTICATION', 'VPN_SSO'],
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: 'src-1234',
      name: 'Wazuh Production',
      sourceType: 'WAZUH',
      ingestionMethod: 'API',
      eventFamilies: ['AUTHENTICATION', 'VPN_SSO'],
    });
  });

  it('rejects invalid payload with 422', async () => {
    const response = await request(app)
      .post('/api/v1/event-sources')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '',
        sourceType: '',
        ingestionMethod: 'API',
        eventFamilies: [],
      });

    expect(response.status).toBe(422);
    expect(eventSourcesService.registerEventSource).not.toHaveBeenCalled();
  });
});
