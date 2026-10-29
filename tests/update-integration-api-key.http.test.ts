import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../src/common/middleware/authenticate.js', () => ({
  authenticate: (req: any, res: any, next: any) => {
    res.locals.authenticatedUserId = '11111111-1111-1111-1111-111111111111';
    next();
  },
}));

describe('PATCH /api/v1/integrations/:id/api-keys/:keyId & /api/v1/integrations/api-keys/:keyId HTTP tests', () => {
  const app = createApp();

  const validKeyId = '33333333-3333-4333-a333-333333333333';
  const validSourceId = '44444444-4444-4444-8444-444444444444';

  const mockUpdatedResponse = {
    id: validKeyId,
    eventSourceId: validSourceId,
    integrationId: validSourceId,
    name: 'Updated Key Name',
    keyName: 'Updated Key Name',
    keyPrefix: 'sec_live_9f0d9c7098',
    keyFingerprint: 'sec_live_9f0d9c7098...****',
    maskedKey: 'sec_live_9f0d9c7098...****',
    status: 'ACTIVE' as const,
    isActive: true,
    scopes: ['events:ingest', 'alerts:read'],
    expiresAt: new Date('2026-12-31T23:59:59.000Z'),
    lastUsedAt: null,
    lastUsedIp: null,
    creator: {
      id: '11111111-1111-1111-1111-111111111111',
      fullName: 'System Administrator',
      email: 'admin@gmail.com',
      username: 'admin',
    },
    createdBy: '11111111-1111-1111-1111-111111111111',
    createdAt: new Date('2026-10-11T00:00:00.000Z'),
    rotatedAt: null,
    revokedAt: null,
    revokedBy: null,
    revoker: null,
    replacementKeyId: null,
    replacementKey: null,
    eventSource: {
      id: validSourceId,
      name: 'Wazuh Manager',
      sourceType: 'Wazuh',
    },
    usage: {
      lastUsedAt: null,
      lastUsedIp: null,
      totalAuditEvents: 0,
      isUsed: false,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(prisma.users.findUnique).mockResolvedValue({
      role: 'ADMIN',
      status: 'ACTIVE',
    } as any);
  });

  it('PATCH /api/v1/integrations/:id/api-keys/:keyId returns 200 with updated API key', async () => {
    vi.spyOn(integrationApiKeysService, 'updateApiKey').mockResolvedValue(mockUpdatedResponse);

    const response = await request(app)
      .patch(`/api/v1/integrations/${validSourceId}/api-keys/${validKeyId}`)
      .send({
        name: 'Updated Key Name',
        scopes: ['events:ingest', 'alerts:read'],
        expiresAt: '2026-12-31T23:59:59.000Z',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(validKeyId);
    expect(response.body.data.scopes).toEqual(['events:ingest', 'alerts:read']);
    expect(integrationApiKeysService.updateApiKey).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      validKeyId,
      expect.objectContaining({
        name: 'Updated Key Name',
        scopes: ['events:ingest', 'alerts:read'],
      }),
      validSourceId,
    );
  });

  it('PATCH /api/v1/integrations/api-keys/:keyId returns 200 without integrationId in path', async () => {
    vi.spyOn(integrationApiKeysService, 'updateApiKey').mockResolvedValue(mockUpdatedResponse);

    const response = await request(app)
      .patch(`/api/v1/integrations/api-keys/${validKeyId}`)
      .send({
        scopes: ['events:ingest', 'alerts:read'],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(validKeyId);
  });

  it('validates UUID params and returns 422 for invalid param', async () => {
    const response = await request(app)
      .patch(`/api/v1/integrations/${validSourceId}/api-keys/not-a-uuid`)
      .send({
        scopes: ['events:ingest'],
      });

    expect(response.status).toBe(422);
  });

  it('validates empty scopes array and returns 422', async () => {
    const response = await request(app)
      .patch(`/api/v1/integrations/${validSourceId}/api-keys/${validKeyId}`)
      .send({
        scopes: [],
      });

    expect(response.status).toBe(422);
  });
});
