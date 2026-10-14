import { describe, expect, it, vi, beforeEach } from 'vitest';
import { integrationApiKeysService } from '../src/modules/audit-security-reporting/integration-api-keys.service.js';
import { integrationApiKeysRepository } from '../src/modules/audit-security-reporting/integration-api-keys.repository.js';
import { AppError } from '../src/common/errors/app-error.js';

describe('Integration API Keys Service', () => {
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

  const mockApiKeyRecord = {
    id: '33333333-3333-3333-3333-333333333333',
    event_source_id: '44444444-4444-4444-4444-444444444444',
    name: 'Splunk Ingest Key',
    key_prefix: 'sec_live_splunk',
    status: 'ACTIVE' as const,
    expires_at: new Date('2028-01-01T00:00:00Z'),
    last_used_at: new Date('2026-10-08T12:00:00Z'),
    last_used_ip: '10.0.0.15',
    created_by: mockAdminUser.id,
    created_at: new Date('2026-09-01T00:00:00Z'),
    rotated_at: null,
    revoked_by: null,
    revoked_at: null,
    replacement_key_id: null,
    api_key_scopes: [
      { id: 's1', scope_code: 'events:ingest', created_at: new Date() },
      { id: 's2', scope_code: 'audit:read', created_at: new Date() },
    ],
    users_integration_api_keys_created_byTousers: {
      id: mockAdminUser.id,
      full_name: 'Lead Administrator',
      email: 'admin@secura.ai',
      username: 'admin',
    },
    event_sources: {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Splunk Enterprise SIEM',
      source_type: 'SIEM',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws 401 when user is not found or inactive', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(null);

    await expect(
      integrationApiKeysService.listApiKeys('unknown-user', {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    ).rejects.toThrowError(AppError);
  });

  it('throws 403 when user is not an administrator', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockNonAdminUser);

    await expect(
      integrationApiKeysService.listApiKeys(mockNonAdminUser.id, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    ).rejects.toThrowError(AppError);
  });

  it('lists integration API keys with creator, scopes, status and no secrets exposed', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findMany').mockResolvedValue([mockApiKeyRecord]);
    vi.spyOn(integrationApiKeysRepository, 'count').mockResolvedValue(1);

    const result = await integrationApiKeysService.listApiKeys(mockAdminUser.id, {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(result.pagination.totalItems).toBe(1);
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item?.id).toBe(mockApiKeyRecord.id);
    expect(item?.name).toBe('Splunk Ingest Key');
    expect(item?.keyName).toBe('Splunk Ingest Key');
    expect(item?.keyPrefix).toBe('sec_live_splunk');
    expect(item?.keyFingerprint).toBe('sec_live_splunk...****');
    expect(item?.maskedKey).toBe('sec_live_splunk...****');
    expect(item?.status).toBe('ACTIVE');
    expect(item?.isActive).toBe(true);
    expect(item?.scopes).toEqual(['events:ingest', 'audit:read']);
    expect(item?.creator?.fullName).toBe('Lead Administrator');
    expect(item?.eventSource?.name).toBe('Splunk Enterprise SIEM');

    // Secret must not be present
    expect((item as unknown as Record<string, unknown>)['secret']).toBeUndefined();
    expect((item as unknown as Record<string, unknown>)['secret_hash']).toBeUndefined();
    expect((item as unknown as Record<string, unknown>)['secretHash']).toBeUndefined();
  });

  it('marks active key as EXPIRED if expires_at is in the past', async () => {
    const expiredRecord = {
      ...mockApiKeyRecord,
      expires_at: new Date(Date.now() - 3600000), // 1 hour ago
    };

    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findMany').mockResolvedValue([expiredRecord]);
    vi.spyOn(integrationApiKeysRepository, 'count').mockResolvedValue(1);

    const result = await integrationApiKeysService.listApiKeys(mockAdminUser.id, {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    const item = result.items[0];
    expect(item?.status).toBe('EXPIRED');
    expect(item?.isActive).toBe(false);
  });

  it('returns keys for a specific integration via listApiKeysForIntegration', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(integrationApiKeysRepository, 'findEventSourceById').mockResolvedValue({
      id: mockApiKeyRecord.event_source_id,
      name: 'Splunk Enterprise SIEM',
      status: 'ACTIVE',
    });
    vi.spyOn(integrationApiKeysRepository, 'findMany').mockResolvedValue([mockApiKeyRecord]);

    const result = await integrationApiKeysService.listApiKeysForIntegration(
      mockAdminUser.id,
      mockApiKeyRecord.event_source_id,
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(mockApiKeyRecord.id);
  });

  it('passes search, creator, scope, and expirationPeriod filters to repository', async () => {
    vi.spyOn(integrationApiKeysRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    const findManySpy = vi
      .spyOn(integrationApiKeysRepository, 'findMany')
      .mockResolvedValue([mockApiKeyRecord]);
    const countSpy = vi.spyOn(integrationApiKeysRepository, 'count').mockResolvedValue(1);

    const filterQuery = {
      page: 1,
      limit: 10,
      search: 'Splunk',
      scope: 'events:ingest',
      creator: 'Lead Administrator',
      expirationPeriod: 'expiring_soon' as const,
      sortBy: 'name' as const,
      sortOrder: 'asc' as const,
    };

    const result = await integrationApiKeysService.listApiKeys(mockAdminUser.id, filterQuery);

    expect(findManySpy).toHaveBeenCalledWith(filterQuery);
    expect(countSpy).toHaveBeenCalledWith(filterQuery);
    expect(result.items).toHaveLength(1);
    expect(result.pagination.totalItems).toBe(1);
  });
});
