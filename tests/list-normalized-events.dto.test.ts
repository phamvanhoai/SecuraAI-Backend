import { describe, expect, it } from 'vitest';
import {
  eventIdParamSchema,
  listNormalizedEventsQuerySchema,
} from '../src/modules/event-ingestion/dto/list-normalized-events.dto.js';

describe('listNormalizedEventsQuerySchema', () => {
  it('applies default pagination and sorting parameters', () => {
    const parsed = listNormalizedEventsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.sortBy).toBe('occurredAt');
    expect(parsed.sortOrder).toBe('desc');
  });

  it('accepts valid custom pagination and sorting parameters', () => {
    const parsed = listNormalizedEventsQuerySchema.parse({
      page: '2',
      limit: '50',
      sortBy: 'eventType',
      sortOrder: 'asc',
    });

    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(50);
    expect(parsed.sortBy).toBe('eventType');
    expect(parsed.sortOrder).toBe('asc');
  });

  it('accepts valid search and filter parameters', () => {
    const parsed = listNormalizedEventsQuerySchema.parse({
      q: 'login failed',
      eventSourceId: '550e8400-e29b-41d4-a716-446655440000',
      eventFamily: 'AUTHENTICATION',
      mappingStatus: 'MAPPED',
      severity: 'HIGH',
      eventType: 'AUTH_FAILED',
      sourceIp: '192.168.1.100',
      account: 'admin@example.com',
      assetId: '550e8400-e29b-41d4-a716-446655440001',
      asset: 'DC-SERVER-01',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T23:59:59.999Z',
    });

    expect(parsed.q).toBe('login failed');
    expect(parsed.eventSourceId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(parsed.eventFamily).toBe('AUTHENTICATION');
    expect(parsed.mappingStatus).toBe('MAPPED');
    expect(parsed.severity).toBe('HIGH');
    expect(parsed.eventType).toBe('AUTH_FAILED');
    expect(parsed.sourceIp).toBe('192.168.1.100');
    expect(parsed.account).toBe('admin@example.com');
    expect(parsed.assetId).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(parsed.asset).toBe('DC-SERVER-01');
    expect(parsed.from).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.to).toBe('2026-01-02T23:59:59.999Z');
  });

  it('rejects limit out of bounds', () => {
    const result = listNormalizedEventsQuerySchema.safeParse({
      limit: 500,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid sort order', () => {
    const result = listNormalizedEventsQuerySchema.safeParse({
      sortOrder: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid event family', () => {
    const result = listNormalizedEventsQuerySchema.safeParse({
      eventFamily: 'INVALID_FAMILY',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mapping status', () => {
    const result = listNormalizedEventsQuerySchema.safeParse({
      mappingStatus: 'INVALID_STATUS',
    });
    expect(result.success).toBe(false);
  });
});

describe('eventIdParamSchema', () => {
  it('accepts valid UUID', () => {
    const result = eventIdParamSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID format', () => {
    const result = eventIdParamSchema.safeParse({
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
