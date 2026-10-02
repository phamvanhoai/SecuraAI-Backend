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
