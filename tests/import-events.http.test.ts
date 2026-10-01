import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/event-import.service.js', () => ({
  eventImportService: { importNormalizedEvents: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { eventImportService } from '../src/modules/event-ingestion/event-import.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const sourceId = '3a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('POST /api/v1/event-sources/:id/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .post(`/api/v1/event-sources/${sourceId}/import`)
      .send({
        events: [{ eventType: 'USER_LOGIN', occurredAt: '2026-09-30T10:00:00.000Z' }],
      });

    expect(response.status).toBe(401);
  });

  it('processes batch import and returns 200 with result statistics', async () => {
    const mockResult = {
      batchId: 'batch-1234',
      eventSourceId: sourceId,
      eventSourceName: 'Corporate Wazuh Manager',
      fileName: 'auth_logs.json',
      fileFormat: 'JSON',
      totalRecords: 1,
      acceptedRecords: 1,
      rejectedRecords: 0,
      status: 'COMPLETED' as const,
      startedAt: new Date('2026-09-30T10:00:00Z'),
      completedAt: new Date('2026-09-30T10:00:01Z'),
      errors: [],
    };

    vi.mocked(eventImportService.importNormalizedEvents).mockResolvedValue(mockResult);

    const response = await request(app)
      .post(`/api/v1/event-sources/${sourceId}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fileName: 'auth_logs.json',
        fileFormat: 'JSON',
        eventFamily: 'AUTHENTICATION',
        events: [
          {
            eventType: 'USER_LOGIN',
            occurredAt: '2026-09-30T10:00:00.000Z',
            accountIdentifier: 'analyst@secura.ai',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.batchId).toBe('batch-1234');
    expect(response.body.data.status).toBe('COMPLETED');
    expect(response.body.data.acceptedRecords).toBe(1);
  });
});
