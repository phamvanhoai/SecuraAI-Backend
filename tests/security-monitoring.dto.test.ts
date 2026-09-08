import { describe, expect, it } from 'vitest';
import {
  createLogSourceBodySchema,
  listLogSourcesQuerySchema,
  updateLogSourceBodySchema,
} from '../src/modules/security-monitoring/dto/log-source.dto.js';
import { ingestSecurityEventsBodySchema } from '../src/modules/security-monitoring/dto/security-event.dto.js';

describe('log source DTOs', () => {
  it('applies safe configuration and pagination defaults', () => {
    expect(
      createLogSourceBodySchema.parse({
        name: ' Authentication logs ',
        sourceType: 'authentication',
        configuration: { format: 'json' },
      }),
    ).toEqual({
      name: 'Authentication logs',
      sourceType: 'authentication',
      configuration: { format: 'json', timezone: 'UTC', collectRawPayload: true },
      status: 'active',
    });
    expect(listLogSourcesQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it.each([
    { name: '', sourceType: 'authentication', configuration: { format: 'json' } },
    { name: 'Logs', sourceType: 'unknown', configuration: { format: 'json' } },
    { name: 'Logs', sourceType: 'system', configuration: { format: 'xml' } },
    {
      name: 'Logs',
      sourceType: 'system',
      configuration: { format: 'json', apiKey: 'must-not-be-accepted' },
    },
  ])('rejects invalid or secret-like arbitrary configuration: %o', (input) => {
    expect(createLogSourceBodySchema.safeParse(input).success).toBe(false);
  });

  it('requires at least one update and validates bounded lists', () => {
    expect(updateLogSourceBodySchema.safeParse({}).success).toBe(false);
    expect(updateLogSourceBodySchema.safeParse({ status: 'inactive' }).success).toBe(true);
    expect(listLogSourcesQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('bounds JSON event ingestion batches', () => {
    expect(
      ingestSecurityEventsBodySchema.safeParse({ events: [{ eventType: 'login' }] }).success,
    ).toBe(true);
    expect(ingestSecurityEventsBodySchema.safeParse({ events: [] }).success).toBe(false);
    expect(
      ingestSecurityEventsBodySchema.safeParse({ events: Array.from({ length: 101 }, () => ({})) })
        .success,
    ).toBe(false);
    expect(ingestSecurityEventsBodySchema.safeParse({ events: ['not-an-object'] }).success).toBe(
      false,
    );
  });
});
