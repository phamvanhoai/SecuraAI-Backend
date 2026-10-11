import { describe, expect, it, vi, beforeEach } from 'vitest';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';
import { integrationApiKeysRepository } from '../src/modules/audit-security-reporting/integration-api-keys.repository.js';
import { AppError } from '../src/common/errors/app-error.js';

describe('View Integration API Key Detail Service', () => {
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

  const mockDetailRecord = {
    id: sampleKeyId,
    event_source_id: sampleEventSourceId,
    name: 'Wazuh HEC Ingest Key',
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
      { id: 's2', scope_code: 'events:read', created_at: new Date() },
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

  it('allows administrator to view key details including creator, scopes, status, and usage info', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockDetailRecord);
    vi.spyOn(integrationApiKeysRepository, 'countAuditLogsForApiKey').mockResolvedValue(42);

    const result = await integrationApiKeysService.getApiKeyDetail(mockAdminUser.id, sampleKeyId);

    expect(result.id).toBe(sampleKeyId);
    expect(result.keyName).toBe('Wazuh HEC Ingest Key');
    expect(result.keyPrefix).toBe('sec_live_9f0d9c7098');
    expect(result.maskedKey).toBe('sec_live_9f0d9c7098...****');
    expect(result.status).toBe('ACTIVE');
    expect(result.isActive).toBe(true);
    expect(result.scopes).toEqual(['events:ingest', 'events:read']);
    expect(result.creator).toEqual({
      id: mockAdminUser.id,
      fullName: 'System Administrator',
      email: 'admin@gmail.com',
      username: 'admin',
    });
    expect(result.eventSource).toEqual({
      id: sampleEventSourceId,
      name: 'Wazuh Production Manager',
      sourceType: 'Wazuh HIDS',
    });
    expect(result.usage).toEqual({
      lastUsedAt: new Date('2026-10-11T12:00:00.000Z'),
      lastUsedIp: '192.168.1.50',
      totalAuditEvents: 42,
      isUsed: true,
    });
  });

  it('throws 403 when user is not an administrator', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockNonAdminUser);

    await expect(
      integrationApiKeysService.getApiKeyDetail(mockNonAdminUser.id, sampleKeyId),
    ).rejects.toThrow(AppError);
  });

  it('throws 404 when key is not found', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(null);

    await expect(
      integrationApiKeysService.getApiKeyDetail(mockAdminUser.id, sampleKeyId),
    ).rejects.toThrow('Integration API key not found');
  });

  it('verifies integration context matches key source', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(mockDetailRecord);

    await expect(
      integrationApiKeysService.getApiKeyDetail(
        mockAdminUser.id,
        sampleKeyId,
        '99999999-9999-9999-9999-999999999999',
      ),
    ).rejects.toThrow('Integration API key not found for the specified integration');
  });

  it('correctly maps expired status and revocation details', async () => {
    const expiredRecord = {
      ...mockDetailRecord,
      status: 'ACTIVE' as const,
      expires_at: new Date(Date.now() - 10000),
      rotated_at: new Date('2026-10-10T00:00:00.000Z'),
      revoked_at: new Date('2026-10-11T00:00:00.000Z'),
      revoked_by: mockAdminUser.id,
      users_integration_api_keys_revoked_byTousers: {
        id: mockAdminUser.id,
        full_name: 'Security Admin',
        email: 'secadmin@example.com',
        username: 'secadmin',
      },
      integration_api_keys: {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Replacement Key',
        key_prefix: 'sec_live_newnew1234',
        status: 'ACTIVE' as const,
      },
    };

    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findById').mockResolvedValue(expiredRecord);
    vi.spyOn(integrationApiKeysRepository, 'countAuditLogsForApiKey').mockResolvedValue(0);

    const result = await integrationApiKeysService.getApiKeyDetail(mockAdminUser.id, sampleKeyId);

    expect(result.status).toBe('EXPIRED');
    expect(result.isActive).toBe(false);
    expect(result.revoker?.fullName).toBe('Security Admin');
    expect(result.replacementKey?.name).toBe('Replacement Key');
  });
});
