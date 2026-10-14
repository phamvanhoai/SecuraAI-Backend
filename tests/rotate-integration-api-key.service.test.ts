import { describe, expect, it, vi, beforeEach } from 'vitest';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';
import { integrationApiKeysRepository } from '../src/modules/audit-security-reporting/integration-api-keys.repository.js';

describe('Rotate Integration API Key Service', () => {
  const mockAdminUser = {
    id: '11111111-1111-1111-1111-111111111111',
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
  };

  const mockNonAdminUser = {
    id: '22222222-2222-2222-2222-222222222222',
    role: 'SECURITY_OFFICER' as const,
    status: 'ACTIVE' as const,
  };

  const sampleEventSourceId = '44444444-4444-4444-8444-444444444444';
  const sampleKeyId = '33333333-3333-3333-3333-333333333333';
  const sampleReplacementKeyId = '55555555-5555-5555-5555-555555555555';

  const mockExistingActiveKey = {
    id: sampleKeyId,
    event_source_id: sampleEventSourceId,
    name: 'Wazuh Ingest Key',
    key_prefix: 'sec_live_oldprefix1',
    status: 'ACTIVE' as const,
    expires_at: new Date(Date.now() + 86400000 * 30),
    last_used_at: new Date(),
    last_used_ip: '192.168.1.50',
    created_by: mockAdminUser.id,
    created_at: new Date(Date.now() - 86400000 * 10),
    rotated_at: null,
    revoked_by: null,
    revoked_at: null,
    replacement_key_id: null,
    api_key_scopes: [
      { id: 's1', scope_code: 'events:ingest', created_at: new Date() },
      { id: 's2', scope_code: 'events:read', created_at: new Date() },
    ],
    users_integration_api_keys_created_byTousers: {
      id: mockAdminUser.id,
      full_name: 'Lead Administrator',
      email: 'admin@secura.ai',
      username: 'admin',
    },
    users_integration_api_keys_revoked_byTousers: null,
    integration_api_keys: null,
    event_sources: {
      id: sampleEventSourceId,
      name: 'Wazuh HIDS Ingestion',
      source_type: 'Wazuh',
    },
  };

  const mockReplacementKeyRecord = {
    id: sampleReplacementKeyId,
    event_source_id: sampleEventSourceId,
    name: 'Wazuh Ingest Key',
    key_prefix: 'sec_live_newprefix2',
    status: 'ACTIVE' as const,
    expires_at: mockExistingActiveKey.expires_at,
    last_used_at: null,
    last_used_ip: null,
    created_by: mockAdminUser.id,
    created_at: new Date(),
    rotated_at: null,
    revoked_by: null,
    revoked_at: null,
    replacement_key_id: null,
    api_key_scopes: [
      { id: 's3', scope_code: 'events:ingest', created_at: new Date() },
      { id: 's4', scope_code: 'events:read', created_at: new Date() },
    ],
    users_integration_api_keys_created_byTousers: {
      id: mockAdminUser.id,
      full_name: 'Lead Administrator',
      email: 'admin@secura.ai',
      username: 'admin',
    },
    event_sources: {
      id: sampleEventSourceId,
      name: 'Wazuh HIDS Ingestion',
      source_type: 'Wazuh',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rotates an active key successfully, preserving scopes and generating a replacement key', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingActiveKey);
    vi.spyOn(integrationApiKeysRepository, 'rotateApiKey').mockResolvedValue(mockReplacementKeyRecord);

    const result = await integrationApiKeysService.rotateApiKey(
      mockAdminUser.id,
      sampleKeyId,
      {},
      sampleEventSourceId,
    );

    expect(result.id).toBe(sampleReplacementKeyId);
    expect(result.replacedKeyId).toBe(sampleKeyId);
    expect(result.secret).toMatch(/^sec_live_[a-f0-9]{48}$/);
    expect(result.keyPrefix).toBe(mockReplacementKeyRecord.key_prefix);
    expect(result.status).toBe('ACTIVE');
    expect(result.isActive).toBe(true);
    expect(result.scopes).toEqual(['events:ingest', 'events:read']);

    expect(integrationApiKeysRepository.rotateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        existingKeyId: sampleKeyId,
        name: 'Wazuh Ingest Key',
        eventSourceId: sampleEventSourceId,
        rotatedBy: mockAdminUser.id,
        status: 'ACTIVE',
        scopes: ['events:ingest', 'events:read'],
      }),
    );
  });

  it('allows overriding expiration date when rotating', async () => {
    const customExpiry = new Date(Date.now() + 86400000 * 90);
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingActiveKey);
    vi.spyOn(integrationApiKeysRepository, 'rotateApiKey').mockResolvedValue({
      ...mockReplacementKeyRecord,
      expires_at: customExpiry,
    });

    const result = await integrationApiKeysService.rotateApiKey(mockAdminUser.id, sampleKeyId, {
      expiresAt: customExpiry.toISOString(),
    });

    expect(result.id).toBe(sampleReplacementKeyId);
    expect(integrationApiKeysRepository.rotateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: expect.any(Date),
      }),
    );
  });

  it('rejects rotation if requester is not an admin with 403 Forbidden', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockNonAdminUser);

    await expect(
      integrationApiKeysService.rotateApiKey(mockNonAdminUser.id, sampleKeyId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects rotation if key does not exist with 404 Not Found', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(null);

    await expect(
      integrationApiKeysService.rotateApiKey(mockAdminUser.id, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects rotation if key does not match context integration id with 404 Not Found', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingActiveKey);

    await expect(
      integrationApiKeysService.rotateApiKey(
        mockAdminUser.id,
        sampleKeyId,
        {},
        '99999999-9999-9999-9999-999999999999',
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects rotating an already revoked key with 400 Bad Request', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue({
      ...mockExistingActiveKey,
      status: 'REVOKED',
      revoked_at: new Date(),
    });

    await expect(
      integrationApiKeysService.rotateApiKey(mockAdminUser.id, sampleKeyId),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot rotate a revoked API key',
    });
  });

  it('rejects rotating an already rotated key with 400 Bad Request', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue({
      ...mockExistingActiveKey,
      status: 'ROTATED',
      rotated_at: new Date(),
      replacement_key_id: '99999999-9999-9999-9999-999999999999',
    });

    await expect(
      integrationApiKeysService.rotateApiKey(mockAdminUser.id, sampleKeyId),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot rotate an already rotated API key',
    });
  });

  it('rejects past expiration date with 400 Bad Request', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingActiveKey);

    const pastDate = new Date(Date.now() - 3600000).toISOString();

    await expect(
      integrationApiKeysService.rotateApiKey(mockAdminUser.id, sampleKeyId, {
        expiresAt: pastDate,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Expiration date must be in the future',
    });
  });
});
