import { describe, expect, it } from 'vitest';
import {
  createIntegrationSchema,
  queryIntegrationsSchema,
  testConnectionSchema,
  updateIntegrationSchema,
} from '../src/modules/integrations/dto/index.js';

describe('Integrations DTO Validation', () => {
  describe('createIntegrationSchema', () => {
    it('accepts valid integration input', () => {
      const parsed = createIntegrationSchema.parse({
        name: 'Wazuh SIEM Server',
        integrationType: 'siem',
        baseUrl: 'https://wazuh.internal.com:55000',
        configuration: { timeoutMs: 3000 },
      });
      expect(parsed.name).toBe('Wazuh SIEM Server');
      expect(parsed.integrationType).toBe('siem');
      expect(parsed.baseUrl).toBe('https://wazuh.internal.com:55000');
    });

    it('rejects invalid integrationType', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Invalid Type Integration',
        integrationType: 'database',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty or whitespace-only name', () => {
      const result = createIntegrationSchema.safeParse({
        name: '   ',
        integrationType: 'firewall',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid URL in baseUrl', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Bad URL',
        integrationType: 'api',
        baseUrl: 'not-a-valid-url',
      });
      expect(result.success).toBe(false);
    });

    it('allows null baseUrl', () => {
      const parsed = createIntegrationSchema.parse({
        name: 'No URL Integration',
        integrationType: 'log_source',
        baseUrl: null,
      });
      expect(parsed.baseUrl).toBeNull();
    });
  });

  describe('updateIntegrationSchema', () => {
    it('accepts valid partial updates', () => {
      const parsed = updateIntegrationSchema.parse({
        name: 'Updated Name',
        status: 'active',
      });
      expect(parsed.name).toBe('Updated Name');
      expect(parsed.status).toBe('active');
    });

    it('strictly prohibits setting status to error from client update', () => {
      const result = updateIntegrationSchema.safeParse({
        status: 'error',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty update object', () => {
      const result = updateIntegrationSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('queryIntegrationsSchema', () => {
    it('applies default pagination and sorting', () => {
      const parsed = queryIntegrationsSchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.sortBy).toBe('createdAt');
      expect(parsed.sortOrder).toBe('desc');
    });

    it('coerces string queries to numbers', () => {
      const parsed = queryIntegrationsSchema.parse({
        page: '3',
        limit: '50',
        type: 'firewall',
        status: 'active',
      });
      expect(parsed.page).toBe(3);
      expect(parsed.limit).toBe(50);
      expect(parsed.type).toBe('firewall');
      expect(parsed.status).toBe('active');
    });
  });

  describe('testConnectionSchema', () => {
    it('defaults timeoutMs to 5000', () => {
      const parsed = testConnectionSchema.parse({});
      expect(parsed.timeoutMs).toBe(5000);
    });

    it('rejects timeoutMs less than 1000 or greater than 10000', () => {
      expect(testConnectionSchema.safeParse({ timeoutMs: 500 }).success).toBe(false);
      expect(testConnectionSchema.safeParse({ timeoutMs: 20000 }).success).toBe(false);
    });
  });
});
