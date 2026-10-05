import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/normalized-events.service.js', () => ({
  normalizedEventsService: {
    listEvents: vi.fn(),
    getEventDetail: vi.fn(),
    getMetrics: vi.fn(),
    updateEventMapping: vi.fn(),
    getMappingOptions: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { normalizedEventsService } from '../src/modules/event-ingestion/normalized-events.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const eventId = '550e8400-e29b-41d4-a716-446655440001';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('Normalized Security Events HTTP Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/events', () => {
    it('requires authentication', async () => {
      const response = await request(app).get('/api/v1/events');
      expect(response.status).toBe(401);
    });

    it('returns 200 with paginated normalized events', async () => {
      const mockResult = {
        items: [
          {
            id: eventId,
            eventSourceId: 'src-001',
            eventSourceName: 'Wazuh SIEM Production',
            eventSourceType: 'WAZUH',
            ingestionBatchId: 'batch-001',
            externalEventId: 'ext-001',
            eventFamily: 'AUTHENTICATION' as const,
            eventType: 'USER_LOGON',
            schemaVersion: '1.0',
            occurredAt: new Date('2026-03-30T10:00:00Z'),
            ingestedAt: new Date('2026-03-30T10:00:01Z'),
            accountIdentifier: 'administrator',
            sourceIp: '192.168.1.10',
            destinationIp: '10.0.0.1',
            deviceIdentifier: 'DC-01',
            severity: 'LOW',
            mappingStatus: 'MAPPED' as const,
            mappedUser: {
              id: 'user-001',
              email: 'admin@company.com',
              fullName: 'Admin User',
            },
            mappedAsset: {
              id: 'asset-001',
              name: 'Primary Domain Controller',
              assetCode: 'AST-DC-01',
              assetType: 'SERVER',
              criticality: 'CRITICAL',
            },
            anomalyCount: 0,
            createdAt: new Date('2026-03-30T10:00:01Z'),
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      vi.mocked(normalizedEventsService.listEvents).mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/v1/events?page=1&limit=20&sortBy=occurredAt&sortOrder=desc')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].eventType).toBe('USER_LOGON');
      expect(response.body.data.items[0].mappedAsset.assetCode).toBe('AST-DC-01');
      expect(normalizedEventsService.listEvents).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          page: 1,
          limit: 20,
          sortBy: 'occurredAt',
          sortOrder: 'desc',
        }),
      );
    });

    it('passes search and filter parameters to service', async () => {
      vi.mocked(normalizedEventsService.listEvents).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      });

      const response = await request(app)
        .get(
          '/api/v1/events?q=failed&eventFamily=AUTHENTICATION&mappingStatus=MAPPED&sourceIp=192.168.1.1&account=admin&from=2026-01-01T00:00:00Z&to=2026-01-02T23:59:59Z',
        )
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(normalizedEventsService.listEvents).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          q: 'failed',
          eventFamily: 'AUTHENTICATION',
          mappingStatus: 'MAPPED',
          sourceIp: '192.168.1.1',
          account: 'admin',
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-02T23:59:59Z',
        }),
      );
    });

    it('rejects invalid query parameters with 422', async () => {
      const response = await request(app)
        .get('/api/v1/events?limit=5000')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(422);
    });
  });

  describe('GET /api/v1/events/metrics', () => {
    it('requires authentication', async () => {
      const response = await request(app).get('/api/v1/events/metrics');
      expect(response.status).toBe(401);
    });

    it('returns 200 with event ingestion metrics', async () => {
      const mockMetrics = {
        totalEvents: 5000,
        totalMapped: 4200,
        totalUnmapped: 800,
        eventsLast24Hours: 450,
        byFamily: {
          AUTHENTICATION: 3000,
          VPN_SSO: 1500,
          APPLICATION_ACCESS: 500,
        },
      };

      vi.mocked(normalizedEventsService.getMetrics).mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/api/v1/events/metrics')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalEvents).toBe(5000);
    });
  });

  describe('GET /api/v1/events/:id', () => {
    it('requires authentication', async () => {
      const response = await request(app).get(`/api/v1/events/${eventId}`);
      expect(response.status).toBe(401);
    });

    it('returns 200 with detailed normalized event information', async () => {
      const mockDetail = {
        id: eventId,
        eventSourceId: 'src-001',
        eventSourceName: 'Wazuh SIEM Production',
        eventSourceType: 'WAZUH',
        ingestionBatchId: 'batch-001',
        externalEventId: 'ext-001',
        eventFamily: 'AUTHENTICATION' as const,
        eventType: 'USER_LOGON',
        schemaVersion: '1.0',
        occurredAt: new Date('2026-03-30T10:00:00Z'),
        ingestedAt: new Date('2026-03-30T10:00:01Z'),
        accountIdentifier: 'administrator',
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.0.1',
        deviceIdentifier: 'DC-01',
        severity: 'LOW',
        mappingStatus: 'MAPPED' as const,
        mappedUser: null,
        mappedAsset: null,
        activeMapping: null,
        mappingHistory: [],
        anomalyCount: 0,
        createdAt: new Date('2026-03-30T10:00:01Z'),
        normalizedPayload: {
          agent: { id: '001', name: 'wazuh-agent-dc' },
          data: { win: { eventdata: { targetUserName: 'administrator' } } },
        },
        anomalyDetections: [],
      };

      vi.mocked(normalizedEventsService.getEventDetail).mockResolvedValue(mockDetail);

      const response = await request(app)
        .get(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.normalizedPayload.agent.name).toBe('wazuh-agent-dc');
    });

    it('rejects invalid event ID with 422', async () => {
      const response = await request(app)
        .get('/api/v1/events/invalid-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(422);
    });
  });

  describe('GET /api/v1/events/mapping-options', () => {
    it('requires authentication', async () => {
      const response = await request(app).get('/api/v1/events/mapping-options');
      expect(response.status).toBe(401);
    });

    it('returns 200 with available users, assets, and accounts', async () => {
      vi.mocked(normalizedEventsService.getMappingOptions).mockResolvedValue({
        users: [{ id: 'user-001', email: 'user@company.com', fullName: 'User 1' }],
        assets: [
          {
            id: 'asset-001',
            name: 'Core Server',
            assetCode: 'AST-01',
            assetType: 'SERVER',
            criticality: 'HIGH',
          },
        ],
        monitoredAccounts: [],
      });

      const response = await request(app)
        .get('/api/v1/events/mapping-options')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.assets).toHaveLength(1);
    });
  });

  describe('PUT /api/v1/events/:id/mappings', () => {
    it('requires authentication', async () => {
      const response = await request(app).put(`/api/v1/events/${eventId}/mappings`);
      expect(response.status).toBe(401);
    });

    it('returns 200 when updating mapping successfully', async () => {
      const mockResult = {
        id: 'map-002',
        eventId,
        userId: '550e8400-e29b-41d4-a716-446655440010',
        monitoredAccountId: null,
        assetId: '550e8400-e29b-41d4-a716-446655440020',
        mappingMethod: 'MANUAL' as const,
        confidence: 1.0,
        reason: 'Correction verified by analyst',
        mappedBy: { id: userId, email: 'admin@company.com', fullName: 'Admin' },
        mappedAt: new Date(),
        isActive: true,
        supersedesMappingId: 'map-001',
        mappedUser: { id: '550e8400-e29b-41d4-a716-446655440010', email: 'analyst@company.com', fullName: 'Analyst' },
        mappedAsset: { id: '550e8400-e29b-41d4-a716-446655440020', name: 'Database', assetCode: 'AST-DB', assetType: 'DB', criticality: 'HIGH' },
        monitoredAccount: null,
        createdAt: new Date(),
      };

      vi.mocked(normalizedEventsService.updateEventMapping).mockResolvedValue(mockResult);

      const response = await request(app)
        .put(`/api/v1/events/${eventId}/mappings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          userId: '550e8400-e29b-41d4-a716-446655440010',
          assetId: '550e8400-e29b-41d4-a716-446655440020',
          reason: 'Correction verified by analyst',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.mappingMethod).toBe('MANUAL');
      expect(normalizedEventsService.updateEventMapping).toHaveBeenCalledWith(
        userId,
        eventId,
        expect.objectContaining({
          userId: '550e8400-e29b-41d4-a716-446655440010',
          assetId: '550e8400-e29b-41d4-a716-446655440020',
          reason: 'Correction verified by analyst',
        }),
      );
    });

    it('rejects invalid payload without reason with 422', async () => {
      const response = await request(app)
        .put(`/api/v1/events/${eventId}/mappings`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(422);
    });
  });
});
