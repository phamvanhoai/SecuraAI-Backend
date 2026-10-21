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
    createApiKey: vi.fn(),
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

const sampleCreatedApiKey = {
  id: '33333333-3333-3333-3333-333333333333',
  eventSourceId: mockIntegrationId,
  integrationId: mockIntegrationId,
  name: 'Wazuh Ingest Key',
  keyName: 'Wazuh Ingest Key',
  keyPrefix: 'sec_live_abcdef1234',
  keyFingerprint: 'sec_live_abcdef1234...****',
  maskedKey: 'sec_live_abcdef1234...****',
  secret: 'sec_live_abcdef12345678901234567890123456789012345678',
  status: 'ACTIVE' as const,
  isActive: true,
  scopes: ['events:ingest', 'events:read'],
  expiresAt: new Date('2028-01-01T00:00:00Z'),
  lastUsedAt: null,
  lastUsedIp: null,
  rotatedAt: null,
  revokedAt: null,
  creator: {
    id: userId,
    fullName: 'Lead Administrator',
    email: 'admin@secura.ai',
    username: 'admin',
  },
  createdBy: userId,
  createdAt: new Date(),
  eventSource: {
    id: mockIntegrationId,
    name: 'Wazuh HIDS Ingestion',
    sourceType: 'Wazuh',
  },
};

describe('Create Integration API Key HTTP Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.users.findUnique).mockResolvedValue({
      role: 'ADMIN',
      status: 'ACTIVE',
    } as any);
  });

  describe('POST /api/v1/integrations/api-keys', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/integrations/api-keys')
        .send({ name: 'Test Key' });

      expect(res.status).toBe(401);
    });

    it('returns 403 when user is not ADMIN', async () => {
      vi.mocked(prisma.users.findUnique).mockResolvedValue({
        role: 'SECURITY_OFFICER',
        status: 'ACTIVE',
      } as any);

      const res = await request(app)
        .post('/api/v1/integrations/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Key' });

      expect(res.status).toBe(403);
    });

    it('returns 201 with created API key metadata and plaintext secret', async () => {
      vi.mocked(integrationApiKeysService.createApiKey).mockResolvedValue(sampleCreatedApiKey);

      const res = await request(app)
        .post('/api/v1/integrations/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Wazuh Ingest Key',
          eventSourceId: mockIntegrationId,
          scopes: ['events:ingest', 'events:read'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sampleCreatedApiKey.id);
      expect(res.body.data.name).toBe('Wazuh Ingest Key');
      expect(res.body.data.secret).toBe(sampleCreatedApiKey.secret);
      expect(res.body.data.scopes).toEqual(['events:ingest', 'events:read']);
      expect(integrationApiKeysService.createApiKey).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          name: 'Wazuh Ingest Key',
          eventSourceId: mockIntegrationId,
        }),
      );
    });

    it('returns 422 when required name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/integrations/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({
          scopes: ['events:ingest'],
        });

      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/v1/integrations/:id/api-keys', () => {
    it('creates key bound to contextual integration id with 201', async () => {
      vi.mocked(integrationApiKeysService.createApiKey).mockResolvedValue(sampleCreatedApiKey);

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/api-keys`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Wazuh Ingest Key',
          scopes: ['events:ingest'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.secret).toBeDefined();
      expect(integrationApiKeysService.createApiKey).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ name: 'Wazuh Ingest Key' }),
        mockIntegrationId,
      );
    });

    it('returns 404 when integration does not exist', async () => {
      vi.mocked(integrationApiKeysService.createApiKey).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Event source / integration not found'),
      );

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/api-keys`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Nonexistent Source Key',
          scopes: ['events:ingest'],
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
