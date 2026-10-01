import { describe, expect, it } from 'vitest';
import {
  importEventItemSchema,
  importEventsBodySchema,
} from '../src/modules/event-ingestion/dto/import-events.dto.js';

describe('importEventItemSchema', () => {
  it('validates a correct normalized event record', () => {
    const valid = {
      externalEventId: 'evt-001',
      eventFamily: 'AUTHENTICATION',
      eventType: 'USER_LOGIN',
      occurredAt: '2026-09-30T12:00:00.000Z',
      accountIdentifier: 'admin@secura.ai',
      sourceIp: '192.168.1.50',
      deviceIdentifier: 'SEC-LAPTOP-01',
      severity: 'LOW',
      normalizedPayload: { authResult: 'SUCCESS' },
    };

    const parsed = importEventItemSchema.parse(valid);
    expect(parsed.eventType).toBe('USER_LOGIN');
    expect(parsed.eventFamily).toBe('AUTHENTICATION');
  });

  it('rejects an invalid event family', () => {
    const invalid = {
      eventFamily: 'INVALID_FAMILY',
      eventType: 'USER_LOGIN',
      occurredAt: '2026-09-30T12:00:00.000Z',
    };

    expect(() => importEventItemSchema.parse(invalid)).toThrow();
  });

  it('rejects missing required fields', () => {
    const invalid = {
      eventFamily: 'AUTHENTICATION',
      // missing eventType and occurredAt
    };

    expect(() => importEventItemSchema.parse(invalid)).toThrow();
  });
});

describe('importEventsBodySchema', () => {
  it('validates a valid import payload', () => {
    const body = {
      fileName: 'auth_batch.json',
      fileFormat: 'JSON',
      eventFamily: 'AUTHENTICATION',
      events: [
        {
          eventType: 'USER_LOGIN',
          occurredAt: '2026-09-30T12:00:00.000Z',
          accountIdentifier: 'user@secura.ai',
        },
      ],
    };

    const parsed = importEventsBodySchema.parse(body);
    expect(parsed.events.length).toBe(1);
    expect(parsed.fileFormat).toBe('JSON');
  });

  it('rejects empty events array', () => {
    const body = {
      events: [],
    };

    expect(() => importEventsBodySchema.parse(body)).toThrow();
  });
});
