import { describe, expect, it } from 'vitest';
import { eventSourceIdParamsSchema } from '../src/modules/event-ingestion/dto/get-event-source-detail.dto.js';

describe('eventSourceIdParamsSchema', () => {
  it('accepts valid UUID parameter', () => {
    const validUuid = '3a9bf33a-02db-48e4-a8ad-90517278d7f2';
    const result = eventSourceIdParamsSchema.safeParse({ id: validUuid });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(validUuid);
    }
  });

  it('rejects invalid UUID parameter', () => {
    const result = eventSourceIdParamsSchema.safeParse({ id: 'invalid-uuid-123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty id parameter', () => {
    const result = eventSourceIdParamsSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects unrecognized properties when strict', () => {
    const result = eventSourceIdParamsSchema.safeParse({
      id: '3a9bf33a-02db-48e4-a8ad-90517278d7f2',
      extra: 'not-allowed',
    });
    expect(result.success).toBe(false);
  });
});
