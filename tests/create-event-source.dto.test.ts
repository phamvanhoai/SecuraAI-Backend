import { describe, expect, it } from 'vitest';
import { createEventSourceSchema } from '../src/modules/event-ingestion/dto/create-event-source.dto.js';

describe('createEventSourceSchema', () => {
  it('validates a valid API event source input', () => {
    const valid = {
      name: 'Wazuh Production SIEM',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.internal.local:55000',
      ingestionMethod: 'API',
      authenticationType: 'BEARER_TOKEN',
      status: 'ACTIVE',
      description: 'Production Wazuh cluster monitoring internal endpoints',
      eventFamilies: ['AUTHENTICATION', 'APPLICATION_ACCESS'],
    };

    const parsed = createEventSourceSchema.parse(valid);
    expect(parsed.name).toBe('Wazuh Production SIEM');
    expect(parsed.ingestionMethod).toBe('API');
    expect(parsed.eventFamilies).toHaveLength(2);
  });

  it('validates a valid FILE event source input without endpoint', () => {
    const valid = {
      name: 'Batch Log File Import',
      sourceType: 'SYSLOG',
      ingestionMethod: 'FILE',
      eventFamilies: ['VPN_SSO'],
    };

    const parsed = createEventSourceSchema.parse(valid);
    expect(parsed.name).toBe('Batch Log File Import');
    expect(parsed.status).toBe('ACTIVE');
    expect(parsed.endpoint).toBeUndefined();
  });

  it('rejects empty name', () => {
    const invalid = {
      name: '   ',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.local',
      ingestionMethod: 'API',
      eventFamilies: ['AUTHENTICATION'],
    };

    expect(() => createEventSourceSchema.parse(invalid)).toThrow();
  });

  it('requires endpoint when ingestionMethod is API', () => {
    const invalid = {
      name: 'Wazuh SIEM',
      sourceType: 'WAZUH',
      endpoint: '   ',
      ingestionMethod: 'API',
      eventFamilies: ['AUTHENTICATION'],
    };

    expect(() => createEventSourceSchema.parse(invalid)).toThrow(
      /Endpoint is required when ingestion method is API/,
    );
  });

  it('requires at least one event family', () => {
    const invalid = {
      name: 'Wazuh SIEM',
      sourceType: 'WAZUH',
      endpoint: 'https://wazuh.local',
      ingestionMethod: 'API',
      eventFamilies: [],
    };

    expect(() => createEventSourceSchema.parse(invalid)).toThrow(
      /At least one event family must be selected/,
    );
  });
});
