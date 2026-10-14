import { describe, expect, it, vi, beforeEach } from 'vitest';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';
import { integrationApiKeysRepository } from '../src/modules/audit-security-reporting/integration-api-keys.repository.js';

describe('Revoke Integration API Key Service', () => {
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

  const mockExistingActiveKey = {
    id: sampleKeyId,
    event_source_id: sampleEventSourceId,
    name: 'Wazuh Ingest Key',
    key_prefix: 'sec_live_abcdef1234',
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

  const mockRevokedKeyRecord = {
    ...mockExistingActiveKey,
    status: 'REVOKED' as const,
    revoked_by: mockAdminUser.id,
    revoked_at: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('revokes an active API key successfully, recording revoker and revoked_at timestamp', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingActiveKey);
    vi.spyOn(integrationApiKeysRepository, 'revokeApiKey').mockResolvedValue(mockRevokedKeyRecord);

    const result = await integrationApiKeysService.revokeApiKey(
      mockAdminUser.id,
      sampleKeyId,
      {},
      sampleEventSourceId,
    );

    expect(result.id).toBe(sampleKeyId);
    expect(result.status).toBe('REVOKED');
    expect(result.isActive).toBe(false);
    expect(result.revokedAt).toBeDefined();

    expect(integrationApiKeysRepository.revokeApiKey).toHaveBeenCalledWith(
      sampleKeyId,
      mockAdminUser.id,
      undefined,
    );
  });

  it('allows providing an optional revocation reason', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingActiveKey);
    vi.spyOn(integrationApiKeysRepository, 'revokeApiKey').mockResolvedValue(mockRevokedKeyRecord);

    const result = await integrationApiKeysService.revokeApiKey(
      mockAdminUser.id,
      sampleKeyId,
      { reason: 'Security incident containment' },
    );

    expect(result.id).toBe(sampleKeyId);
    expect(integrationApiKeysRepository.revokeApiKey).toHaveBeenCalledWith(
      sampleKeyId,
      mockAdminUser.id,
      'Security incident containment',
    );
  });

  it('rejects revocation when requester is not an admin with 403 Forbidden', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockNonAdminUser);

    await expect(
      integrationApiKeysService.revokeApiKey(mockNonAdminUser.id, sampleKeyId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects revocation when key does not exist with 404 Not Found', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(null);

    await expect(
      integrationApiKeysService.revokeApiKey(
        mockAdminUser.id,
        '00000000-0000-0000-0000-000000000000',
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects revocation when key does not match context integration id with 404 Not Found', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingActiveKey);

    await expect(
      integrationApiKeysService.revokeApiKey(
        mockAdminUser.id,
        sampleKeyId,
        {},
        '99999999-9999-9999-9999-999999999999',
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects revoking an already revoked key with 400 Bad Request', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue({
      ...mockExistingActiveKey,
      status: 'REVOKED',
      revoked_at: new Date(),
    });

    await expect(
      integrationApiKeysService.revokeApiKey(mockAdminUser.id, sampleKeyId),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'API key is already revoked',
    });
  });
});
