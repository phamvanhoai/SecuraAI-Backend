import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/event-import.service.js', () => ({
  eventImportService: {
    getBatchDetail: vi.fn(),
    getBatchInvalidEvents: vi.fn(),
    getSourceBatches: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { eventImportService } from '../src/modules/event-ingestion/event-import.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const sourceId = '3a9bf33a-02db-48e4-a8ad-90517278d7f2';
const batchId = '550e8400-e29b-41d4-a716-446655440000';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('View Import Results & Invalid Events Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/event-sources/batches/:batchId', () => {
    it('requires authentication', async () => {
      const response = await request(app).get(`/api/v1/event-sources/batches/${batchId}`);
      expect(response.status).toBe(401);
    });

    it('returns 200 with batch summary details', async () => {
      const mockDetail = {
        id: batchId,
        eventSourceId: sourceId,
        eventSourceName: 'Corporate Wazuh',
        ingestionMethod: 'FILE' as const,
        eventFamily: 'AUTHENTICATION' as const,
        fileName: 'events.json',
        fileFormat: 'JSON',
        totalRecords: 10,
        acceptedRecords: 9,
        rejectedRecords: 1,
        status: 'PARTIALLY_COMPLETED' as const,
        startedAt: new Date('2026-09-30T10:00:00Z'),
        completedAt: new Date('2026-09-30T10:00:02Z'),
        createdBy: userId,
        creatorName: 'System Admin',
        createdAt: new Date('2026-09-30T10:00:00Z'),
      };

      vi.mocked(eventImportService.getBatchDetail).mockResolvedValue(mockDetail);

      const response = await request(app)
        .get(`/api/v1/event-sources/batches/${batchId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(batchId);
      expect(response.body.data.acceptedRecords).toBe(9);
      expect(response.body.data.rejectedRecords).toBe(1);
    });
  });

  describe('GET /api/v1/event-sources/batches/:batchId/invalid-events', () => {
    it('returns 200 with paginated invalid event records', async () => {
      const mockResult = {
        items: [
          {
            id: 'inv-1',
            batchId,
            eventSourceId: sourceId,
            eventFamily: 'AUTHENTICATION' as const,
            recordIndex: 3,
            errorCode: 'VALIDATION_FAILED',
            errorMessage: 'eventType is required',
            rawPayload: { accountIdentifier: 'test' },
            createdAt: new Date('2026-09-30T10:00:01Z'),
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      vi.mocked(eventImportService.getBatchInvalidEvents).mockResolvedValue(mockResult);

      const response = await request(app)
        .get(`/api/v1/event-sources/batches/${batchId}/invalid-events?page=1&limit=20`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].recordIndex).toBe(3);
    });
  });

  describe('GET /api/v1/event-sources/:id/batches', () => {
    it('returns 200 with source batches history', async () => {
      const mockResult = {
        items: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 1,
        },
      };

      vi.mocked(eventImportService.getSourceBatches).mockResolvedValue(mockResult);

      const response = await request(app)
        .get(`/api/v1/event-sources/${sourceId}/batches`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
