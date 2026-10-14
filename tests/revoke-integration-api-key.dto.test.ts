import { describe, expect, it } from 'vitest';
import { revokeIntegrationApiKeySchema } from '../src/modules/audit-security-reporting/dto/revoke-integration-api-key.dto.js';

describe('Revoke Integration API Key DTO', () => {
  it('validates an empty payload and defaults to empty object', () => {
    const result = revokeIntegrationApiKeySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it('validates undefined payload and defaults to empty object', () => {
    const result = revokeIntegrationApiKeySchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it('accepts optional revocation reason within 500 characters', () => {
    const result = revokeIntegrationApiKeySchema.safeParse({
      reason: 'Key compromised in testing repository',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Key compromised in testing repository');
    }
  });

  it('rejects revocation reason exceeding 500 characters', () => {
    const result = revokeIntegrationApiKeySchema.safeParse({
      reason: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
