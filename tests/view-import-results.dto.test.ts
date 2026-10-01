import { describe, expect, it } from 'vitest';
import {
  batchIdParamSchema,
  getBatchInvalidEventsQuerySchema,
  getSourceBatchesQuerySchema,
} from '../src/modules/event-ingestion/dto/import-events.dto.js';

describe('view-import-results DTO validation', () => {
  it('validates valid batch UUID param', () => {
    const valid = batchIdParamSchema.safeParse({
      batchId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid batch UUID param', () => {
    const invalid = batchIdParamSchema.safeParse({
      batchId: 'not-a-uuid',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates and applies defaults for getBatchInvalidEvents query', () => {
    const parsed = getBatchInvalidEventsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);

    const custom = getBatchInvalidEventsQuerySchema.parse({
      page: '2',
      limit: '50',
      errorCode: 'INVALID_TIMESTAMP',
      q: 'occurredAt',
    });
    expect(custom.page).toBe(2);
    expect(custom.limit).toBe(50);
    expect(custom.errorCode).toBe('INVALID_TIMESTAMP');
    expect(custom.q).toBe('occurredAt');
  });

  it('validates getSourceBatches query', () => {
    const parsed = getSourceBatchesQuerySchema.parse({
      page: '3',
      limit: '15',
    });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(15);
  });
});
