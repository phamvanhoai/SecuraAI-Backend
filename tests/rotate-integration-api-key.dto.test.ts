import { describe, expect, it } from 'vitest';
import { rotateIntegrationApiKeySchema } from '../src/modules/audit-security-reporting/dto/rotate-integration-api-key.dto.js';

describe('Rotate Integration API Key DTO', () => {
  const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();

  it('validates an empty payload and defaults to empty object', () => {
    const result = rotateIntegrationApiKeySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it('validates undefined payload', () => {
    const result = rotateIntegrationApiKeySchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it('validates optional future expiration date', () => {
    const result = rotateIntegrationApiKeySchema.safeParse({
      expiresAt: futureDate,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresAt).toBe(futureDate);
    }
  });

  it('allows null expiresAt to clear expiration', () => {
    const result = rotateIntegrationApiKeySchema.safeParse({
      expiresAt: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresAt).toBeNull();
    }
  });

  it('rejects invalid datetime format for expiresAt', () => {
    const result = rotateIntegrationApiKeySchema.safeParse({
      expiresAt: 'not-a-datetime',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional secret hint string up to 1000 characters', () => {
    const result = rotateIntegrationApiKeySchema.safeParse({
      secret: 'custom_hint',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secret).toBe('custom_hint');
    }
  });

  it('rejects secret exceeding 1000 characters', () => {
    const result = rotateIntegrationApiKeySchema.safeParse({
      secret: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});
