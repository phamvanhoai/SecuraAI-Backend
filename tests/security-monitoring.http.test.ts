import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, findIngestionSourceMock, ingestMock, listMock, updateMock } = vi.hoisted(
  () => ({
    createMock: vi.fn(),
    findIngestionSourceMock: vi.fn(),
    ingestMock: vi.fn(),
    listMock: vi.fn(),
    updateMock: vi.fn(),
  }),
);

vi.mock('../src/modules/security-monitoring/security-monitoring.repository.js', () => ({
  securityMonitoringRepository: {
    createLogSource: createMock,
    findActiveAsset: vi.fn(),
    findUsableIntegration: vi.fn(),
    findLogSourceForIngestion: findIngestionSourceMock,
    ingestSecurityEvents: ingestMock,
    listLogSources: listMock,
    updateLogSource: updateMock,
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

const sourceRecord = {
  log_source_id: '00000000-0000-4000-8000-000000000010',
  name: 'Auth logs',
  source_type: 'authentication',
  configuration: { format: 'json', timezone: 'UTC', collectRawPayload: true },
  status: 'active',
  last_received_at: null,
  created_at: new Date('2026-09-08T00:00:00.000Z'),
  updated_at: new Date('2026-09-08T00:00:00.000Z'),
  assets: null,
  integrations: null,
};

describe('security monitoring log source HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ items: [], total: 0 });
    createMock.mockResolvedValue(sourceRecord);
    updateMock.mockResolvedValue(sourceRecord);
    findIngestionSourceMock.mockResolvedValue({
      log_source_id: sourceRecord.log_source_id,
      status: 'active',
      configuration: { format: 'json' },
    });
    ingestMock.mockResolvedValue({ ingested: 1, duplicates: 0 });
  });

  it('requires authentication and read permission', async () => {
    const unauthorized = await request(createApp()).get('/api/v1/security-monitoring/log-sources');
    const forbidden = await request(createApp())
      .get('/api/v1/security-monitoring/log-sources')
      .set('authorization', `Bearer ${token([])}`);
    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('returns a normalized paginated list', async () => {
    const response = await request(createApp())
      .get('/api/v1/security-monitoring/log-sources?page=2&limit=10&status=active')
      .set('authorization', `Bearer ${token(['log-sources.read'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        items: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      },
    });
  });

  it('validates and creates a non-secret log source configuration', async () => {
    const invalid = await request(createApp())
      .post('/api/v1/security-monitoring/log-sources')
      .set('authorization', `Bearer ${token(['log-sources.manage'])}`)
      .send({
        name: 'Auth logs',
        sourceType: 'authentication',
        configuration: { format: 'json', apiKey: 'secret' },
      });
    expect(invalid.status).toBe(422);
    expect(createMock).not.toHaveBeenCalled();

    const response = await request(createApp())
      .post('/api/v1/security-monitoring/log-sources')
      .set('authorization', `Bearer ${token(['log-sources.manage'])}`)
      .send({
        name: 'Auth logs',
        sourceType: 'authentication',
        configuration: { format: 'json' },
      });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { name: 'Auth logs', sourceType: 'authentication' },
    });
  });

  it('validates updates before reaching the repository', async () => {
    const response = await request(createApp())
      .patch('/api/v1/security-monitoring/log-sources/not-a-uuid')
      .set('authorization', `Bearer ${token(['log-sources.manage'])}`)
      .send({});
    expect(response.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('protects, validates and accepts security event ingestion', async () => {
    const path = `/api/v1/security-monitoring/log-sources/${sourceRecord.log_source_id}/events`;
    expect((await request(createApp()).post(path).send({ events: [] })).status).toBe(401);
    expect(
      (
        await request(createApp())
          .post(path)
          .set('authorization', `Bearer ${token([])}`)
          .send({ events: [] })
      ).status,
    ).toBe(403);
    const invalid = await request(createApp())
      .post(path)
      .set('authorization', `Bearer ${token(['security-events.ingest'])}`)
      .send({ events: [] });
    expect(invalid.status).toBe(422);
    const response = await request(createApp())
      .post(path)
      .set('authorization', `Bearer ${token(['security-events.ingest'])}`)
      .send({ events: [{ eventType: 'login.failed', timestamp: '2026-09-08T00:00:00Z' }] });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      success: true,
      data: { received: 1, ingested: 1, duplicates: 0 },
    });
  });
});
