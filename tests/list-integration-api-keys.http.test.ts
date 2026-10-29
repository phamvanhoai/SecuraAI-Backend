import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    users: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock('../src/modules/audit-security-reporting/integration-api-keys.service.js', () => ({
  integrationApiKeysService: {
    listApiKeys: vi.fn(),
    listApiKeysForIntegration: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/database/prisma.js';
import { AppError } from '../src/common/errors/app-error.js';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const mockIntegrationId = '550e8400-e29b-41d4-a716-446655440000';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

const sampleApiKeyItem = {
  id: '33333333-3333-3333-3333-333333333333',
  eventSourceId: mockIntegrationId,
  integrationId: mockIntegrationId,
  name: 'Splunk Ingest Key',
  keyName: 'Splunk Ingest Key',
  keyPrefix: 'sec_live_splunk',
  keyFingerprint: 'sec_live_splunk...****',
  maskedKey: 'sec_live_splunk...****',
  status: 'ACTIVE' as const,
  isActive: true,
  scopes: ['events:ingest', 'audit:read'],
  expiresAt: new Date('2028-01-01T00:00:00Z'),
  lastUsedAt: new Date('2026-10-08T12:00:00Z'),
  lastUsedIp: '10.0.0.15',
  creator: {
    id: userId,
    fullName: 'Lead Administrator',
    email: 'admin@secura.ai',
    username: 'admin',
  },
  createdBy: userId,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  rotatedAt: null,
  revokedAt: null,
  eventSource: {
    id: mockIntegrationId,
    name: 'Splunk Enterprise SIEM',
    sourceType: 'SIEM',
  },
};

describe('Integration API Keys HTTP endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.users.findUnique).mockResolvedValue({
      role: 'ADMIN',
      status: 'ACTIVE',
    } as any);
  });

  describe('GET /api/v1/integrations/:id/api-keys', () => {
    it('requires authentication', async () => {
      const res = await request(app).get(`/api/v1/integrations/${mockIntegrationId}/api-keys`);
      expect(res.status).toBe(401);
    });

    it('returns 403 when user is not authorized', async () => {
      vi.mocked(prisma.users.findUnique).mockResolvedValue({
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      } as any);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/api-keys`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('returns API keys list for an integration without secret leakage', async () => {
      vi.mocked(integrationApiKeysService.listApiKeysForIntegration).mockResolvedValue([
        sampleApiKeyItem,
      ]);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/api-keys?status=ACTIVE`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);

      const item = res.body.data[0];
      expect(item.name).toBe('Splunk Ingest Key');
      expect(item.keyFingerprint).toBe('sec_live_splunk...****');
      expect(item.scopes).toEqual(['events:ingest', 'audit:read']);
      expect(item.creator.fullName).toBe('Lead Administrator');
      expect(item.secret).toBeUndefined();
      expect(item.secret_hash).toBeUndefined();
      expect(item.secretHash).toBeUndefined();
    });
  });

  describe('GET /api/v1/audit-security-reporting/api-keys', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/audit-security-reporting/api-keys');
      expect(res.status).toBe(401);
    });

    it('returns paginated API keys list', async () => {
      vi.mocked(integrationApiKeysService.listApiKeys).mockResolvedValue({
        items: [sampleApiKeyItem],
        pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
      });

      const res = await request(app)
        .get('/api/v1/audit-security-reporting/api-keys?page=1&limit=20&search=Splunk')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it('forwards search, creator, scope, and expirationPeriod filters to service', async () => {
      vi.mocked(integrationApiKeysService.listApiKeys).mockResolvedValue({
        items: [sampleApiKeyItem],
        pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
      });

      const res = await request(app)
        .get(
          '/api/v1/audit-security-reporting/api-keys?search=Splunk&scope=events:ingest&creator=Admin&expirationPeriod=expiring_soon&status=ACTIVE',
        )
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(integrationApiKeysService.listApiKeys).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          search: 'Splunk',
          scope: 'events:ingest',
          creator: 'Admin',
          expirationPeriod: 'expiring_soon',
          status: 'ACTIVE',
        }),
      );
    });
  });
});
