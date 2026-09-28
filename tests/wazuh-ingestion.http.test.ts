import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/wazuh-ingestion.service.js', () => ({
  wazuhIngestionService: { ingestNormalizedEvent: vi.fn() },
}));

import { createApp } from '../src/app.js';
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

describe('POST /api/v1/integrations/wazuh/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts normalized event from Wazuh and returns 201', async () => {
    const mockIngested = {
      eventId: 'evt-uuid-123',
      externalEventId: '1727512200.12345',
      eventFamily: 'AUTHENTICATION' as const,
      eventType: 'LOGIN_FAILURE',
      status: 'INGESTED' as const,
      ingestedAt: new Date('2026-09-28T08:30:05.000Z'),
    };

    vi.mocked(wazuhIngestionService.ingestNormalizedEvent).mockResolvedValue(mockIngested);

    const response = await request(app)
      .post('/api/v1/integrations/wazuh/events')
      .set('X-SecuraAI-Ingest-Key', 'test-token')
      .send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      eventId: 'evt-uuid-123',
      status: 'INGESTED',
      eventType: 'LOGIN_FAILURE',
    });
    expect(wazuhIngestionService.ingestNormalizedEvent).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ eventFamily: 'AUTHENTICATION' }),
    );
  });

  it('rejects invalid payload with 422', async () => {
    const response = await request(app)
      .post('/api/v1/integrations/wazuh/events')
      .send({ invalid: true });

    expect(response.status).toBe(422);
    expect(wazuhIngestionService.ingestNormalizedEvent).not.toHaveBeenCalled();
  });
});
