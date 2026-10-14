import { describe, expect, it } from 'vitest';
import { searchSystemLogsQuerySchema } from '../src/modules/notification-system-logs/dto/search-system-logs.dto.js';

describe('searchSystemLogsQuerySchema', () => {
  it('parses bounded advanced filters', () => {
    expect(searchSystemLogsQuerySchema.parse({ page: '2', status: 'DENIED', from: '2026-10-01T00:00:00.000Z' })).toMatchObject({ page: 2, limit: 20, status: 'DENIED' });
  });
  it('rejects an inverted time range', () => {
    expect(() => searchSystemLogsQuerySchema.parse({ from: '2026-10-02T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })).toThrow();
  });
});
