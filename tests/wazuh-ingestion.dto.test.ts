import { describe, expect, it } from 'vitest';
import { wazuhEventIngestSchema } from '../src/modules/event-ingestion/dto/wazuh-event-ingest.dto.js';

describe('wazuhEventIngestSchema', () => {
  it('accepts a valid normalized event payload', () => {
    const valid = {
      source: { type: 'WAZUH' },
      eventFamily: 'AUTHENTICATION',
      eventType: 'LOGIN_FAILURE',
      timestamp: '2026-09-28T08:30:00.000Z',
      rawEventId: '1727512200.12345',
      actor: {
        username: 'hacker_test',
        domain: 'WORKGROUP',
        userId: 'S-1-5-21-1234',
      },
      sourceIp: '192.168.1.200',
      agent: {
        id: '001',
        name: 'DESKTOP-WIN11',
        ip: '192.168.1.50',
      },
      rule: {
        id: '60122',
        level: 5,
        description: 'Logon Failure',
      },
      metadata: {
        platform: 'windows',
        eventId: '4625',
      },
    };

    const parsed = wazuhEventIngestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects payload with invalid event family', () => {
    const invalid = {
      source: { type: 'WAZUH' },
      eventFamily: 'UNKNOWN_FAMILY',
      eventType: 'LOGIN_FAILURE',
      timestamp: '2026-09-28T08:30:00.000Z',
      actor: { username: 'test' },
      agent: { id: '001', name: 'agent1' },
      rule: { id: '100' },
    };

    const parsed = wazuhEventIngestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects payload without actor username', () => {
    const invalid = {
      source: { type: 'WAZUH' },
      eventFamily: 'AUTHENTICATION',
      eventType: 'LOGIN_FAILURE',
      timestamp: '2026-09-28T08:30:00.000Z',
      actor: {},
      agent: { id: '001', name: 'agent1' },
      rule: { id: '100' },
    };

    const parsed = wazuhEventIngestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});
