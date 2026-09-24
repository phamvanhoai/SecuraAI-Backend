import { describe, expect, it } from 'vitest';
import { AppError } from '../src/common/errors/app-error.js';
import { normalizeSecurityEvents } from '../src/modules/security-monitoring/security-event.normalizer.js';

describe('security event normalization', () => {
  const expectErrorCode = (action: () => unknown, code: string): void => {
    try {
      action();
      throw new Error('Expected normalization to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppError);
      if (error instanceof AppError) expect(error.code).toBe(code);
    }
  };

  it('applies configured nested mappings and canonical normalization', () => {
    const [event] = normalizeSecurityEvents(
      {
        events: [
          {
            id: 'evt-1',
            kind: 'LOGIN_FAILED',
            observed: '2026-09-08T12:00:00+07:00',
            client: { ip: '192.0.2.1' },
            level: 'HIGH',
          },
        ],
      },
      {
        format: 'json',
        collectRawPayload: false,
        fieldMapping: {
          externalEventId: 'id',
          eventType: 'kind',
          timestamp: 'observed',
          sourceIp: 'client.ip',
          severity: 'level',
        },
      },
    );
    expect(event).toMatchObject({
      externalEventId: 'evt-1',
      eventType: 'LOGIN_FAILED',
      severity: 'high',
      sourceIp: '192.0.2.1',
      rawPayload: null,
    });
    expect(event?.eventTime.toISOString()).toBe('2026-09-08T05:00:00.000Z');
  });

  it('rejects missing canonical fields, invalid IPs and non-JSON sources', () => {
    expectErrorCode(
      () =>
        normalizeSecurityEvents(
          { events: [{ timestamp: '2026-09-08T00:00:00Z' }] },
          { format: 'json' },
        ),
      'INVALID_SECURITY_EVENT',
    );
    expectErrorCode(
      () =>
        normalizeSecurityEvents(
          {
            events: [
              { eventType: 'login', timestamp: '2026-09-08T00:00:00Z', sourceIp: 'invalid' },
            ],
          },
          { format: 'json' },
        ),
      'INVALID_SECURITY_EVENT',
    );
    expectErrorCode(
      () =>
        normalizeSecurityEvents(
          { events: [{ eventType: 'login', timestamp: '2026-09-08T00:00:00Z' }] },
          { format: 'syslog' },
        ),
      'UNSUPPORTED_INGEST_FORMAT',
    );
  });
});
