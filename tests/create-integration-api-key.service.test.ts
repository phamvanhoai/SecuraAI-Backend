import { describe, expect, it, vi, beforeEach } from 'vitest';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';
import { integrationApiKeysRepository } from '../src/modules/audit-security-reporting/integration-api-keys.repository.js';
import { AppError } from '../src/common/errors/app-error.js';

describe('Create Integration API Key Service', () => {
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

  const mockCreatedKeyRecord = {
    id: '33333333-3333-3333-3333-333333333333',
    event_source_id: sampleEventSourceId,
    name: 'Wazuh Ingest Key',
    key_prefix: 'sec_live_abcdef1234',
    status: 'ACTIVE' as const,
    expires_at: new Date(Date.now() + 86400000 * 30),
    last_used_at: null,
    last_used_ip: null,
    created_by: mockAdminUser.id,
    created_at: new Date(),
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
    event_sources: {
      id: sampleEventSourceId,
      name: 'Wazuh HIDS Ingestion',
      source_type: 'Wazuh',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows administrator to generate API key with secret token and metadata', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findEventSourceById').mockResolvedValue({
      id: sampleEventSourceId,
      name: 'Wazuh HIDS Ingestion',
      status: 'ACTIVE',
    });
    vi.spyOn(integrationApiKeysRepository, 'createApiKey').mockResolvedValue(mockCreatedKeyRecord);

    const result = await integrationApiKeysService.createApiKey(mockAdminUser.id, {
      name: 'Wazuh Ingest Key',
      eventSourceId: sampleEventSourceId,
      scopes: ['events:ingest', 'events:read'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    });

    expect(result.id).toBe(mockCreatedKeyRecord.id);
    expect(result.name).toBe('Wazuh Ingest Key');
    expect(result.keyPrefix).toBe(mockCreatedKeyRecord.key_prefix);
    expect(result.scopes).toEqual(['events:ingest', 'events:read']);
    expect(result.secret).toMatch(/^sec_live_[a-f0-9]{48}$/);
    expect(result.maskedKey).toContain('...');
    expect(result.status).toBe('ACTIVE');
    expect(result.isActive).toBe(true);
    expect(result.creator?.email).toBe('admin@secura.ai');
    expect(integrationApiKeysRepository.createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wazuh Ingest Key',
        eventSourceId: sampleEventSourceId,
        createdBy: mockAdminUser.id,
        scopes: ['events:ingest', 'events:read'],
      }),
    );
  });

  it('rejects non-admin role with 403 Forbidden', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockNonAdminUser);

    await expect(
      integrationApiKeysService.createApiKey(mockNonAdminUser.id, {
        name: 'Unauthorized Key',
        scopes: ['events:ingest'],
      }),
    ).rejects.toThrow(AppError);

    await expect(
      integrationApiKeysService.createApiKey(mockNonAdminUser.id, {
        name: 'Unauthorized Key',
        scopes: ['events:ingest'],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when target eventSourceId does not exist', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findEventSourceById').mockResolvedValue(null);

    await expect(
      integrationApiKeysService.createApiKey(mockAdminUser.id, {
        name: 'Missing Source Key',
        eventSourceId: '00000000-0000-0000-0000-000000000000',
        scopes: ['events:ingest'],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('allows creating general integration key without eventSourceId', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'createApiKey').mockResolvedValue({
      ...mockCreatedKeyRecord,
      event_source_id: null,
      event_sources: null,
    });

    const result = await integrationApiKeysService.createApiKey(mockAdminUser.id, {
      name: 'Global SIEM Ingest Key',
      scopes: ['events:ingest'],
    });

    expect(result.id).toBe(mockCreatedKeyRecord.id);
    expect(result.eventSourceId).toBeNull();
    expect(result.secret).toMatch(/^sec_live_/);
  });
});
