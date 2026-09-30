import { describe, expect, it } from 'vitest';
import {
  testEventSourceConnectionSchema,
  testExistingEventSourceConnectionSchema,
} from '../src/modules/event-ingestion/dto/test-event-source-connection.dto.js';

describe('testEventSourceConnectionSchema', () => {
  it('validates a valid test connection payload', () => {
    const result = testEventSourceConnectionSchema.safeParse({
      endpoint: 'https://192.168.56.101:55000',
      username: 'wazuh-wui',
      password: 'password123',
      verifySsl: false,
      timeoutMs: 8000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.endpoint).toBe('https://192.168.56.101:55000');
      expect(result.data.username).toBe('wazuh-wui');
      expect(result.data.password).toBe('password123');
      expect(result.data.verifySsl).toBe(false);
      expect(result.data.timeoutMs).toBe(8000);
    }
  });

  it('applies defaults for verifySsl and timeoutMs', () => {
    const result = testEventSourceConnectionSchema.safeParse({
      endpoint: 'wazuh.internal:55000',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verifySsl).toBe(true);
      expect(result.data.timeoutMs).toBe(5000);
    }
  });

  it('rejects empty endpoint', () => {
    const result = testEventSourceConnectionSchema.safeParse({
      endpoint: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('rejects timeout below 1000ms or above 30000ms', () => {
    expect(
      testEventSourceConnectionSchema.safeParse({
        endpoint: 'https://wazuh.internal:55000',
        timeoutMs: 500,
      }).success,
    ).toBe(false);

    expect(
      testEventSourceConnectionSchema.safeParse({
        endpoint: 'https://wazuh.internal:55000',
        timeoutMs: 45000,
      }).success,
    ).toBe(false);
  });
});

describe('testExistingEventSourceConnectionSchema', () => {
  it('validates empty body with defaults for existing source test', () => {
    const result = testExistingEventSourceConnectionSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeoutMs).toBe(5000);
    }
  });
});
