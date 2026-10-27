import { describe, expect, it, vi, beforeEach } from 'vitest';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';
import { integrationApiKeysRepository } from '../src/modules/audit-security-reporting/integration-api-keys.repository.js';
import { AppError } from '../src/common/errors/app-error.js';

describe('Edit API Key Scope & Expiration Service', () => {
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

  const sampleKeyId = '33333333-3333-3333-3333-333333333333';
  const sampleEventSourceId = '44444444-4444-4444-8444-444444444444';

  const mockExistingRecord = {
    id: sampleKeyId,
    event_source_id: sampleEventSourceId,
    name: 'Wazuh Ingest Key',
    key_prefix: 'sec_live_9f0d9c7098',
    status: 'ACTIVE' as const,
    expires_at: new Date('2026-11-10T15:06:00.000Z'),
    last_used_at: new Date('2026-10-11T12:00:00.000Z'),
    last_used_ip: '192.168.1.50',
    created_by: mockAdminUser.id,
    created_at: new Date('2026-10-11T00:00:00.000Z'),
    rotated_at: null,
    revoked_by: null,
    revoked_at: null,
    replacement_key_id: null,
    api_key_scopes: [
      { id: 's1', scope_code: 'events:ingest', created_at: new Date() },
    ],
    users_integration_api_keys_created_byTousers: {
      id: mockAdminUser.id,
      full_name: 'System Administrator',
      email: 'admin@gmail.com',
      username: 'admin',
    },
    users_integration_api_keys_revoked_byTousers: null,
    integration_api_keys: null,
    event_sources: {
      id: sampleEventSourceId,
      name: 'Wazuh Production Manager',
      source_type: 'Wazuh HIDS',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows administrator to update scopes, name, and expiration date', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingRecord);

    const futureDate = new Date(Date.now() + 86400000 * 60);
    const updatedRecord = {
      ...mockExistingRecord,
      name: 'Updated Wazuh Key',
      expires_at: futureDate,
      api_key_scopes: [
        { id: 's1', scope_code: 'events:ingest', created_at: new Date() },
        { id: 's2', scope_code: 'events:read', created_at: new Date() },
      ],
    };

    const updateSpy = vi
      .spyOn(integrationApiKeysRepository, 'updateApiKey')
      .mockResolvedValue(updatedRecord);

    const result = await integrationApiKeysService.updateApiKey(
      mockAdminUser.id,
      sampleKeyId,
      {
        keyName: 'Updated Wazuh Key',
        scopes: ['events:ingest', 'events:read'],
        expiresAt: futureDate.toISOString(),
      },
      sampleEventSourceId,
    );

    expect(updateSpy).toHaveBeenCalledWith(
      sampleKeyId,
      expect.objectContaining({
        name: 'Updated Wazuh Key',
        scopes: ['events:ingest', 'events:read'],
        expiresAt: expect.any(Date),
        updatedBy: mockAdminUser.id,
      }),
    );
    expect(result.keyName).toBe('Updated Wazuh Key');
    expect(result.scopes).toEqual(['events:ingest', 'events:read']);
    expect(result.status).toBe('ACTIVE');
  });

  it('allows clearing expiration date by setting expiresAt to null', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingRecord);

    const updatedRecord = {
      ...mockExistingRecord,
      expires_at: null,
    };

    const updateSpy = vi
      .spyOn(integrationApiKeysRepository, 'updateApiKey')
      .mockResolvedValue(updatedRecord);

    const result = await integrationApiKeysService.updateApiKey(mockAdminUser.id, sampleKeyId, {
      expiresAt: null,
    });

    expect(updateSpy).toHaveBeenCalledWith(
      sampleKeyId,
      expect.objectContaining({
        expiresAt: null,
      }),
    );
    expect(result.expiresAt).toBeNull();
  });

  it('rejects past expiration date with 400 Bad Request', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingRecord);

    const pastDate = new Date(Date.now() - 3600000).toISOString();

    await expect(
      integrationApiKeysService.updateApiKey(mockAdminUser.id, sampleKeyId, {
        expiresAt: pastDate,
      }),
    ).rejects.toThrow('Expiration date must be in the future');
  });

  it('rejects empty scopes with 400 Bad Request', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockExistingRecord);

    await expect(
      integrationApiKeysService.updateApiKey(mockAdminUser.id, sampleKeyId, {
        scopes: [],
      }),
    ).rejects.toThrow();
  });

  it('rejects modifying a revoked API key', async () => {
    const revokedRecord = {
      ...mockExistingRecord,
      status: 'REVOKED' as const,
    };

    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(revokedRecord);

    await expect(
      integrationApiKeysService.updateApiKey(mockAdminUser.id, sampleKeyId, {
        scopes: ['events:read'],
      }),
    ).rejects.toThrow('Cannot modify a revoked API key');
  });

  it('throws 403 when user is not an administrator', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockNonAdminUser);

    await expect(
      integrationApiKeysService.updateApiKey(mockNonAdminUser.id, sampleKeyId, {
        scopes: ['events:read'],
      }),
    ).rejects.toThrow(AppError);
  });

  it('throws 404 when key is not found', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(null);

    await expect(
      integrationApiKeysService.updateApiKey(mockAdminUser.id, sampleKeyId, {
        scopes: ['events:read'],
      }),
    ).rejects.toThrow('Integration API key not found');
  });

  it('rejects adding events:ingest scope to an API key not bound to an event source', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue({
      ...mockExistingRecord,
      event_source_id: null,
      event_sources: null,
    });

    await expect(
      integrationApiKeysService.updateApiKey(mockAdminUser.id, sampleKeyId, {
        scopes: ['events:ingest', 'events:read'],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('events:ingest'),
    });
  });
});

