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

describe('POST /api/v1/integrations/:id/api-keys/:keyId/revoke & /api/v1/integrations/api-keys/:keyId/revoke HTTP tests', () => {
  const app = createApp();

  const validKeyId = '33333333-3333-4333-a333-333333333333';
  const validSourceId = '44444444-4444-4444-8444-444444444444';

  const mockRevokedResponse = {
    id: validKeyId,
    eventSourceId: validSourceId,
    integrationId: validSourceId,
    name: 'Wazuh Ingest Key',
    keyName: 'Wazuh Ingest Key',
    keyPrefix: 'sec_live_9f0d9c7098',
    keyFingerprint: 'sec_live_9f0d9c7098...****',
    maskedKey: 'sec_live_9f0d9c7098...****',
    status: 'REVOKED' as const,
    isActive: false,
    scopes: ['events:ingest'],
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
    createdAt: new Date('2026-10-11T12:00:00.000Z'),
    rotatedAt: null,
    revokedAt: new Date('2026-10-13T13:00:00.000Z'),
    eventSource: {
      id: validSourceId,
      name: 'Wazuh Manager',
      sourceType: 'Wazuh',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(prisma.users.findUnique).mockResolvedValue({
      role: 'ADMIN',
      status: 'ACTIVE',
    } as any);
  });

  it('POST /api/v1/integrations/:id/api-keys/:keyId/revoke returns 200 with revoked key metadata', async () => {
    vi.spyOn(integrationApiKeysService, 'revokeApiKey').mockResolvedValue(mockRevokedResponse);

    const response = await request(app)
      .post(`/api/v1/integrations/${validSourceId}/api-keys/${validKeyId}/revoke`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(validKeyId);
    expect(response.body.data.status).toBe('REVOKED');
    expect(response.body.data.isActive).toBe(false);
    expect(integrationApiKeysService.revokeApiKey).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      validKeyId,
      {},
      validSourceId,
    );
  });

  it('POST /api/v1/integrations/api-keys/:keyId/revoke returns 200 without integrationId in path', async () => {
    vi.spyOn(integrationApiKeysService, 'revokeApiKey').mockResolvedValue(mockRevokedResponse);

    const response = await request(app)
      .post(`/api/v1/integrations/api-keys/${validKeyId}/revoke`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(validKeyId);
    expect(response.body.data.status).toBe('REVOKED');
    expect(integrationApiKeysService.revokeApiKey).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      validKeyId,
      {},
    );
  });

  it('POST /api/v1/integrations/api-keys/:keyId/revoke accepts optional reason in body', async () => {
    vi.spyOn(integrationApiKeysService, 'revokeApiKey').mockResolvedValue(mockRevokedResponse);

    const reason = 'Deprecated integration pipeline';
    const response = await request(app)
      .post(`/api/v1/integrations/api-keys/${validKeyId}/revoke`)
      .send({ reason });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(integrationApiKeysService.revokeApiKey).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      validKeyId,
      { reason },
    );
  });

  it('returns 422 when keyId param is not a valid UUID', async () => {
    const response = await request(app)
      .post(`/api/v1/integrations/${validSourceId}/api-keys/not-a-uuid/revoke`)
      .send({});

    expect(response.status).toBe(422);
  });

  it('returns 422 when reason exceeds maximum length', async () => {
    const response = await request(app)
      .post(`/api/v1/integrations/api-keys/${validKeyId}/revoke`)
      .send({ reason: 'a'.repeat(501) });

    expect(response.status).toBe(422);
  });
});
