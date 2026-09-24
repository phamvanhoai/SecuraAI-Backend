import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/common/utils/tokens.js';
import { encryptSecret, decryptSecret } from '../src/common/utils/encryption.js';
import { integrationsRepository } from '../src/modules/integrations/integrations.repository.js';

describe('Manage Integration API Keys HTTP API (UC 13.3 - Admin Only)', () => {
  const app = createApp();

  const mockIntegrationId = randomUUID();
  const mockOtherIntegrationId = randomUUID();
  const mockApiKeyId = randomUUID();
  const mockUserId = randomUUID();

  const adminToken = signAccessToken({
    userId: mockUserId,
    roles: ['ADMIN'],
    permissions: ['integrations.create', 'integrations.read', 'integrations.update', 'integrations.connect'],
  });

  const unauthorizedToken = signAccessToken({
    userId: randomUUID(),
    roles: ['EMPLOYEE'],
    permissions: ['some.other.permission'],
  });

  const mockIntegration = {
    integration_id: mockIntegrationId,
    name: 'Wazuh SIEM',
    integration_type: 'siem',
    base_url: 'https://siem.test.com',
    configuration: null,
    status: 'active',
    last_connected_at: null,
    created_by_user_id: mockUserId,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
  };

  const mockApiKeyRecord = {
    integration_api_key_id: mockApiKeyId,
    integration_id: mockIntegrationId,
    key_name: 'Splunk Ingest Key',
    key_fingerprint: 'sec_...2345',
    expires_at: new Date(Date.now() + 86400000), // tomorrow
    is_active: true,
    created_at: new Date('2026-09-01T00:00:00Z'),
  };

  const mockLogRecord = {
    integration_log_id: randomUUID(),
    integration_id: mockIntegrationId,
    level: 'info',
    message: 'API_KEY_CREATED',
    created_at: new Date('2026-09-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // 1. Cryptographic Nonce Randomness Test
  // -------------------------------------------------------------
  describe('AES-256-GCM Nonce Randomness', () => {
    it('generates different ciphertexts for identical plaintext secrets due to random 12-byte IV', () => {
      const plaintext = 'super-secret-api-token-value';
      const encrypted1 = encryptSecret(plaintext);
      const encrypted2 = encryptSecret(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decryptSecret(encrypted1)).toBe(plaintext);
      expect(decryptSecret(encrypted2)).toBe(plaintext);
    });
  });

  // -------------------------------------------------------------
  // 2. Role Authorization Tests
  // -------------------------------------------------------------
  describe('Role Authorization (Admin only)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`/api/v1/integrations/${mockIntegrationId}/api-keys`);
      expect(res.status).toBe(401);
    });

    it('returns 403 when user lacks integrations.read permission', async () => {
      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/api-keys`)
        .set('Authorization', `Bearer ${unauthorizedToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 403 when user lacks integrations.update permission on POST', async () => {
      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/api-keys`)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({ keyName: 'Test Key' });

      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------
  // 3. Secret Leakage Prevention Tests
  // -------------------------------------------------------------
  describe('Secret Leakage Prevention', () => {
    it('GET list never exposes plaintext secret or secret_encrypted', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findApiKeysByIntegrationId').mockResolvedValue([mockApiKeyRecord]);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/api-keys`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);

      const item = res.body.data[0] as Record<string, unknown>;
      expect(item['id']).toBe(mockApiKeyId);
      expect(item['keyName']).toBe('Splunk Ingest Key');
      expect(item['keyFingerprint']).toBe('sec_...2345');
      expect(item['status']).toBe('ACTIVE');
      expect(item['secret']).toBeUndefined();
      expect(item['secret_encrypted']).toBeUndefined();
      expect(item['secretEncrypted']).toBeUndefined();
    });

    it('GET by ID never exposes plaintext secret or secret_encrypted', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findApiKeyById').mockResolvedValue(mockApiKeyRecord);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/api-keys/${mockApiKeyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data['id']).toBe(mockApiKeyId);
      expect(data['status']).toBe('ACTIVE');
      expect(data['secret']).toBeUndefined();
      expect(data['secret_encrypted']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // 4. Cross-Integration Boundary Tests
  // -------------------------------------------------------------
  describe('Cross-Integration Boundary Guard', () => {
    it('returns 404 when querying a key belonging to a different integration', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findApiKeyById').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockOtherIntegrationId}/api-keys/${mockApiKeyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('API_KEY_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------
  // 5. Create API Key (Show-Once Pattern)
  // -------------------------------------------------------------
  describe('POST /api/v1/integrations/:id/api-keys', () => {
    it('creates API key and returns plaintext secret one time along with computed ACTIVE status', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'createApiKey').mockResolvedValue({
        integration_api_key_id: mockApiKeyId,
        integration_id: mockIntegrationId,
        key_name: 'New FortiGate Token',
        key_fingerprint: 'sec_...1234',
        expires_at: null,
        is_active: true,
        created_at: new Date('2026-09-01T00:00:00Z'),
      });
      const logSpy = vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue(mockLogRecord);

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/api-keys`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          keyName: 'New FortiGate Token',
          secret: 'custom-fortigate-secret-token-1234',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockApiKeyId);
      expect(res.body.data.keyName).toBe('New FortiGate Token');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.secret).toBe('custom-fortigate-secret-token-1234');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_id: mockIntegrationId,
          message: 'API_KEY_CREATED',
        }),
      );
    });

    it('rejects past expiration date with 422 validation error', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/api-keys`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          keyName: 'Expired Test Key',
          expiresAt: pastDate,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -------------------------------------------------------------
  // 6. Rotate API Key (Show-Once Pattern & Audit)
  // -------------------------------------------------------------
  describe('POST /api/v1/integrations/:id/api-keys/:keyId/rotate', () => {
    it('rotates secret, updates fingerprint, creates API_KEY_ROTATED log and returns new secret once', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findApiKeyById').mockResolvedValue(mockApiKeyRecord);
      vi.spyOn(integrationsRepository, 'updateApiKey').mockResolvedValue({
        ...mockApiKeyRecord,
        key_fingerprint: 'sec_...9999',
      });
      const logSpy = vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        ...mockLogRecord,
        message: 'API_KEY_ROTATED',
      });

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/api-keys/${mockApiKeyId}/rotate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          secret: 'brand-new-rotated-secret-key-9999',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.secret).toBe('brand-new-rotated-secret-key-9999');
      expect(res.body.data.keyFingerprint).toBe('sec_...9999');
      expect(res.body.data.status).toBe('ACTIVE');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_id: mockIntegrationId,
          message: 'API_KEY_ROTATED',
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // 7. Revoke API Key (Deactivate)
  // -------------------------------------------------------------
  describe('POST /api/v1/integrations/:id/api-keys/:keyId/revoke', () => {
    it('sets is_active to false, logs API_KEY_REVOKED and returns status INACTIVE', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findApiKeyById').mockResolvedValue(mockApiKeyRecord);
      vi.spyOn(integrationsRepository, 'revokeApiKey').mockResolvedValue({
        ...mockApiKeyRecord,
        is_active: false,
      });
      const logSpy = vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        ...mockLogRecord,
        level: 'warn',
        message: 'API_KEY_REVOKED',
      });

      const res = await request(app)
        .post(`/api/v1/integrations/${mockIntegrationId}/api-keys/${mockApiKeyId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);
      expect(res.body.data.status).toBe('INACTIVE');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_id: mockIntegrationId,
          message: 'API_KEY_REVOKED',
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // 8. Update & Reactivate API Key
  // -------------------------------------------------------------
  describe('PATCH /api/v1/integrations/:id/api-keys/:keyId', () => {
    it('updates metadata and logs API_KEY_REACTIVATED when switching from inactive to active', async () => {
      const inactiveKey = { ...mockApiKeyRecord, is_active: false };
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findApiKeyById').mockResolvedValue(inactiveKey);
      vi.spyOn(integrationsRepository, 'updateApiKey').mockResolvedValue({
        ...inactiveKey,
        is_active: true,
        key_name: 'Renamed and Reactivated Key',
      });
      const logSpy = vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        ...mockLogRecord,
        message: 'API_KEY_REACTIVATED',
      });

      const res = await request(app)
        .patch(`/api/v1/integrations/${mockIntegrationId}/api-keys/${mockApiKeyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          keyName: 'Renamed and Reactivated Key',
          isActive: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.keyName).toBe('Renamed and Reactivated Key');
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_id: mockIntegrationId,
          message: 'API_KEY_REACTIVATED',
        }),
      );
    });

    it('computes EXPIRED status if key is active but expiration date has passed', async () => {
      const expiredPastDate = new Date(Date.now() - 3600000); // 1 hour ago
      const expiredKey = { ...mockApiKeyRecord, expires_at: expiredPastDate, is_active: true };

      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      vi.spyOn(integrationsRepository, 'findApiKeyById').mockResolvedValue(expiredKey);

      const res = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/api-keys/${mockApiKeyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('EXPIRED');
    });

    it('filters API keys list by isActive query parameter (true/false) and search', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockIntegration);
      const findSpy = vi.spyOn(integrationsRepository, 'findApiKeysByIntegrationId').mockResolvedValue([mockApiKeyRecord]);

      const resActive = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/api-keys?isActive=true&search=Splunk`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resActive.status).toBe(200);
      expect(findSpy).toHaveBeenCalledWith(
        mockIntegrationId,
        expect.objectContaining({ isActive: true, search: 'Splunk' }),
      );

      const resInactive = await request(app)
        .get(`/api/v1/integrations/${mockIntegrationId}/api-keys?isActive=false`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resInactive.status).toBe(200);
      expect(findSpy).toHaveBeenCalledWith(
        mockIntegrationId,
        expect.objectContaining({ isActive: false }),
      );
    });
  });
});
