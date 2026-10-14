import { describe, expect, it } from 'vitest';
import {
  listIntegrationApiKeysQuerySchema,
  integrationApiKeyParamsSchema,
  integrationApiKeyItemDtoSchema,
} from '../src/modules/audit-security-reporting/dto/list-integration-api-keys.dto.js';

describe('List Integration API Keys DTOs', () => {
  const sampleEventSourceId = '550e8400-e29b-41d4-a716-446655440000';
  const sampleApiKeyId = '550e8400-e29b-41d4-a716-446655440001';
  const sampleUserId = '550e8400-e29b-41d4-a716-446655440002';

  it('validates default query parameters correctly', () => {
    const result = listIntegrationApiKeysQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('validates custom query parameters and string boolean coercion', () => {
    const result = listIntegrationApiKeysQuerySchema.safeParse({
      page: '2',
      limit: '50',
      search: ' Splunk ',
      status: 'ACTIVE',
      isActive: 'true',
      scope: 'events:ingest',
      creator: 'admin@secura.ai',
      expirationPeriod: 'expiring_soon',
      expiresFrom: '2026-10-01T00:00:00Z',
      expiresTo: '2026-11-01T00:00:00Z',
      eventSourceId: sampleEventSourceId,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
      expect(result.data.search).toBe('Splunk');
      expect(result.data.status).toBe('ACTIVE');
      expect(result.data.isActive).toBe(true);
      expect(result.data.scope).toBe('events:ingest');
      expect(result.data.creator).toBe('admin@secura.ai');
      expect(result.data.expirationPeriod).toBe('expiring_soon');
      expect(result.data.expiresFrom).toEqual(new Date('2026-10-01T00:00:00Z'));
      expect(result.data.expiresTo).toEqual(new Date('2026-11-01T00:00:00Z'));
      expect(result.data.eventSourceId).toBe(sampleEventSourceId);
      expect(result.data.sortBy).toBe('name');
      expect(result.data.sortOrder).toBe('asc');
    }
  });

  it('rejects invalid UUID in params schema', () => {
    const result = integrationApiKeyParamsSchema.safeParse({
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('validates a complete API key item DTO ensuring secret is omitted', () => {
    const validItem = {
      id: sampleApiKeyId,
      eventSourceId: sampleEventSourceId,
      integrationId: sampleEventSourceId,
      name: 'Wazuh Ingest Key',
      keyName: 'Wazuh Ingest Key',
      keyPrefix: 'sec_live_wazuh',
      keyFingerprint: 'sec_live_wazuh...****',
      maskedKey: 'sec_live_wazuh...****',
      status: 'ACTIVE',
      isActive: true,
      scopes: ['events:ingest', 'audit:read'],
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      lastUsedAt: new Date('2026-10-09T00:00:00Z'),
      lastUsedIp: '192.168.1.100',
      creator: {
        id: sampleUserId,
        fullName: 'Admin User',
        email: 'admin@secura.ai',
        username: 'admin',
      },
      createdBy: sampleUserId,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      rotatedAt: null,
      revokedAt: null,
      eventSource: {
        id: sampleEventSourceId,
        name: 'Wazuh SIEM',
        sourceType: 'SIEM',
      },
    };

    const result = integrationApiKeyItemDtoSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });
});
