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
    testConnection: vi.fn(),
    testConnectionById: vi.fn(),
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

const mockDiagnosticResult = {
  connected: true,
  statusCode: 200,
  latencyMs: 120,
  message: 'Wazuh API connected and authenticated successfully',
  provider: 'wazuh',
  details: {
    title: 'Wazuh REST API',
    apiVersion: 'v4.8.0',
    hostname: 'wazuh-master',
  },
  verifySslWarning: false,
};

describe('POST /api/v1/event-sources/test-connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication and returns 401 without token', async () => {
    const response = await request(app)
      .post('/api/v1/event-sources/test-connection')
      .send({ endpoint: 'https://192.168.56.101:55000' });
    expect(response.status).toBe(401);
  });

  it('validates request body and returns 422 if endpoint is missing', async () => {
    const response = await request(app)
      .post('/api/v1/event-sources/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(422);
  });

  it('returns 200 with diagnostic result when testing connection with custom payload', async () => {
    vi.mocked(eventSourcesService.testConnection).mockResolvedValue(mockDiagnosticResult);

    const response = await request(app)
      .post('/api/v1/event-sources/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endpoint: 'https://192.168.56.101:55000',
        username: 'wazuh-wui',
        password: 'password123',
        verifySsl: false,
        timeoutMs: 5000,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: mockDiagnosticResult,
    });
    expect(eventSourcesService.testConnection).toHaveBeenCalledWith(userId, {
      endpoint: 'https://192.168.56.101:55000',
      username: 'wazuh-wui',
      password: 'password123',
      verifySsl: false,
      timeoutMs: 5000,
    });
  });
});

describe('POST /api/v1/event-sources/:id/test-connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates UUID params and returns 422 for invalid format', async () => {
    const response = await request(app)
      .post('/api/v1/event-sources/invalid-uuid/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(422);
  });

  it('returns 200 with diagnostic result when testing existing source', async () => {
    vi.mocked(eventSourcesService.testConnectionById).mockResolvedValue(mockDiagnosticResult);

    const response = await request(app)
      .post(`/api/v1/event-sources/${sourceId}/test-connection`)
      .set('Authorization', `Bearer ${token}`)
      .send({ timeoutMs: 7000 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: mockDiagnosticResult,
    });
    expect(eventSourcesService.testConnectionById).toHaveBeenCalledWith(userId, sourceId, {
      timeoutMs: 7000,
    });
  });
});
