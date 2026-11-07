import { describe, expect, it } from 'vitest';
import {
  createIntegrationApiKeySchema,
  standardApiKeyScopes,
} from '../src/modules/audit-security-reporting/dto/create-integration-api-key.dto.js';

describe('Create Integration API Key DTO', () => {
  const validEventSourceId = '550e8400-e29b-41d4-a716-446655440000';
  const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();

  it('validates a valid payload with name and default scopes', () => {
    const result = createIntegrationApiKeySchema.safeParse({
      name: 'Wazuh Ingestion Collector',
      eventSourceId: validEventSourceId,
      expiresAt: futureDate,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Wazuh Ingestion Collector');
      expect(result.data.eventSourceId).toBe(validEventSourceId);
      expect(result.data.scopes).toEqual(['events:ingest']);
      expect(result.data.status).toBe('ACTIVE');
    }
  });

  it('accepts keyName alias as name', () => {
    const result = createIntegrationApiKeySchema.safeParse({
      keyName: 'Syslog Relay Key',
      scopes: ['events:ingest', 'events:read'],
      expiresAt: futureDate,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyName).toBe('Syslog Relay Key');
      expect(result.data.scopes).toEqual(['events:ingest', 'events:read']);
      expect(result.data.expiresAt).toBe(futureDate);
    }
  });

  it('rejects empty name or whitespace-only name', () => {
    const result = createIntegrationApiKeySchema.safeParse({
      name: '   ',
      scopes: ['events:ingest'],
      expiresAt: futureDate,
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty scopes array', () => {
    const result = createIntegrationApiKeySchema.safeParse({
      name: 'Test Key',
      scopes: [],
      expiresAt: futureDate,
    });

    expect(result.success).toBe(false);
  });

  it('rejects past expiration date', () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const result = createIntegrationApiKeySchema.safeParse({
      name: 'Expired Key',
      expiresAt: pastDate,
    });

    expect(result.success).toBe(false);
  });

  it('rejects null or missing expiresAt since non-expiring keys are not permitted', () => {
    const nullResult = createIntegrationApiKeySchema.safeParse({
      name: 'Persistent Service Key',
      expiresAt: null,
    });

    expect(nullResult.success).toBe(false);
    if (!nullResult.success) {
      expect(nullResult.error.issues[0]?.message).toBe(
        'Expiration date is required. Non-expiring API keys are not permitted',
      );
    }

    const missingResult = createIntegrationApiKeySchema.safeParse({
      name: 'Persistent Service Key',
    });

    expect(missingResult.success).toBe(false);
    if (!missingResult.success) {
      expect(missingResult.error.issues[0]?.message).toBe(
        'Expiration date is required. Non-expiring API keys are not permitted',
      );
    }
  });

  it('rejects invalid UUID for eventSourceId', () => {
    const result = createIntegrationApiKeySchema.safeParse({
      name: 'Invalid Source Key',
      eventSourceId: 'not-a-uuid',
      expiresAt: futureDate,
    });

    expect(result.success).toBe(false);
  });

  it('includes standard scopes', () => {
    expect(standardApiKeyScopes).toContain('events:ingest');
    expect(standardApiKeyScopes).toContain('events:read');
    expect(standardApiKeyScopes).toContain('alerts:read');
  });
});
