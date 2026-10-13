import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';

vi.mock('../src/common/middleware/authenticate.js', () => ({
  authenticate: (req: any, res: any, next: any) => {
    res.locals.authenticatedUserId = '11111111-1111-1111-1111-111111111111';
    next();
  },
}));

describe('GET /api/v1/integrations/:id/api-keys/:keyId & /api/v1/integrations/api-keys/:keyId HTTP tests', () => {
  const app = createApp();

  const validKeyId = '33333333-3333-4333-a333-333333333333';
  const validSourceId = '44444444-4444-4444-8444-444444444444';

  const mockDetailResponse = {
    id: validKeyId,
    eventSourceId: validSourceId,
    integrationId: validSourceId,
    name: 'Wazuh Ingest Token',
    keyName: 'Wazuh Ingest Token',
    keyPrefix: 'sec_live_9f0d9c7098',
    keyFingerprint: 'sec_live_9f0d9c7098...****',
    maskedKey: 'sec_live_9f0d9c7098...****',
    status: 'ACTIVE' as const,
    isActive: true,
    scopes: ['events:ingest'],
    expiresAt: new Date('2026-11-10T15:00:00.000Z'),
    lastUsedAt: new Date('2026-10-11T12:00:00.000Z'),
    lastUsedIp: '10.0.0.1',
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
      lastUsedAt: new Date('2026-10-11T12:00:00.000Z'),
      lastUsedIp: '10.0.0.1',
      totalAuditEvents: 15,
      isUsed: true,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/integrations/:id/api-keys/:keyId returns 200 with full key metadata', async () => {
    vi.spyOn(integrationApiKeysService, 'getApiKeyDetail').mockResolvedValue(mockDetailResponse);

    const response = await request(app).get(
      `/api/v1/integrations/${validSourceId}/api-keys/${validKeyId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(validKeyId);
    expect(response.body.data.name).toBe('Wazuh Ingest Token');
    expect(response.body.data.usage.totalAuditEvents).toBe(15);
  });

  it('GET /api/v1/integrations/api-keys/:keyId returns 200 with key metadata', async () => {
    vi.spyOn(integrationApiKeysService, 'getApiKeyDetail').mockResolvedValue(mockDetailResponse);

    const response = await request(app).get(`/api/v1/integrations/api-keys/${validKeyId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(validKeyId);
  });

  it('validates UUID params and returns 422 for invalid format', async () => {
    const response = await request(app).get(
      `/api/v1/integrations/${validSourceId}/api-keys/not-a-uuid`,
    );

    expect(response.status).toBe(422);
  });
});
