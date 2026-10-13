import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    integration_api_keys: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../src/modules/event-ingestion/wazuh-ingestion.service.js', () => ({
  wazuhIngestionService: { ingestNormalizedEvent: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { wazuhIngestionService } from '../src/modules/event-ingestion/wazuh-ingestion.service.js';

const app = createApp();

const validPayload = {
  source: { type: 'WAZUH' },
  eventFamily: 'AUTHENTICATION',
  eventType: 'LOGIN_FAILURE',
  timestamp: '2026-09-28T08:30:00.000Z',
  rawEventId: '1727512200.12345',
  actor: {
    username: 'hacker_test',
    domain: 'WORKGROUP',
    userId: 'S-1-5-21-1234',
  },
  sourceIp: '192.168.1.200',
  agent: {
    id: '001',
    name: 'DESKTOP-WIN11',
    ip: '192.168.1.50',
  },
  rule: {
    id: '60122',
    level: 5,
    description: 'Logon Failure',
  },
  metadata: {
    platform: 'windows',
    eventId: '4625',
  },
};

const mockIngested = {
  eventId: 'evt-uuid-123',
  externalEventId: '1727512200.12345',
  eventFamily: 'AUTHENTICATION' as const,
  eventType: 'LOGIN_FAILURE',
  status: 'INGESTED' as const,
  ingestedAt: new Date('2026-09-28T08:30:05.000Z'),
};

describe('POST /api/v1/integrations/wazuh/events - API Key Auth & Scope Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['SECURAAI_INGEST_TOKEN'];
    delete process.env['WAZUH_INGEST_TOKEN'];
  });

  it('rejects with 401 when no API key or token header is provided', async () => {
    const response = await request(app)
      .post('/api/v1/integrations/wazuh/events')
      .send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain('Missing API key');
    expect(wazuhIngestionService.ingestNormalizedEvent).not.toHaveBeenCalled();
  });

  it('rejects with 401 when API key is expired or invalid', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    vi.mocked(prisma.integration_api_keys.findUnique).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/integrations/wazuh/events')
      .set('X-API-Key', rawSecret)
      .send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toBe('Invalid or unauthorized API key');
    expect(wazuhIngestionService.ingestNormalizedEvent).not.toHaveBeenCalled();
  });

  it('rejects with 403 Forbidden when key lacks events:ingest scope', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(rawSecret).digest('hex');

    vi.mocked(prisma.integration_api_keys.findUnique).mockResolvedValue({
      id: 'key-1',
      name: 'Read-only Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: hash,
      status: 'ACTIVE',
      expires_at: null,
      event_source_id: null,
      event_sources: null,
      api_key_scopes: [{ scope_code: 'alerts:read' }], // missing events:ingest
    } as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>);

    const response = await request(app)
      .post('/api/v1/integrations/wazuh/events')
      .set('X-API-Key', rawSecret)
      .send(validPayload);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain("Insufficient API key scope permissions: 'events:ingest' required");
    expect(wazuhIngestionService.ingestNormalizedEvent).not.toHaveBeenCalled();
  });

  it('accepts normalized event when dynamic API key is valid and has events:ingest scope', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(rawSecret).digest('hex');

    vi.mocked(prisma.integration_api_keys.findUnique).mockResolvedValue({
      id: 'key-1',
      name: 'Wazuh Ingest Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: hash,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 86400000),
      event_source_id: 'src-1',
      event_sources: {
        id: 'src-1',
        name: 'Wazuh Manager',
        status: 'ACTIVE',
      },
      api_key_scopes: [{ scope_code: 'events:ingest' }],
    } as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>);

    vi.mocked(wazuhIngestionService.ingestNormalizedEvent).mockResolvedValue(mockIngested);

    const response = await request(app)
      .post('/api/v1/integrations/wazuh/events')
      .set('X-API-Key', rawSecret)
      .send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      eventId: 'evt-uuid-123',
      status: 'INGESTED',
      eventType: 'LOGIN_FAILURE',
    });
    expect(wazuhIngestionService.ingestNormalizedEvent).toHaveBeenCalled();
  });

  it('accepts event with configured static environment token via X-SecuraAI-Ingest-Key', async () => {
    process.env['SECURAAI_INGEST_TOKEN'] = 'test-token';
    vi.mocked(wazuhIngestionService.ingestNormalizedEvent).mockResolvedValue(mockIngested);

    const response = await request(app)
      .post('/api/v1/integrations/wazuh/events')
      .set('X-SecuraAI-Ingest-Key', 'test-token')
      .send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(wazuhIngestionService.ingestNormalizedEvent).toHaveBeenCalled();
  });

  it('rejects invalid payload with 422 after successful authentication', async () => {
    process.env['SECURAAI_INGEST_TOKEN'] = 'test-token';

    const response = await request(app)
      .post('/api/v1/integrations/wazuh/events')
      .set('X-SecuraAI-Ingest-Key', 'test-token')
      .send({ invalid: true });

    expect(response.status).toBe(422);
    expect(wazuhIngestionService.ingestNormalizedEvent).not.toHaveBeenCalled();
  });
});
