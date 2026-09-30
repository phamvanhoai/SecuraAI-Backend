import { describe, expect, it } from 'vitest';
import { listEventSourcesQuerySchema } from '../src/modules/event-ingestion/dto/list-event-sources.dto.js';

describe('listEventSourcesQuerySchema', () => {
  it('applies defaults for empty query', () => {
    const result = listEventSourcesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe('updatedAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('accepts valid query parameters', () => {
    const result = listEventSourcesQuerySchema.safeParse({
      page: '2',
      limit: '50',
      q: 'wazuh',
      sourceType: 'WAZUH',
      status: 'ACTIVE',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
      expect(result.data.q).toBe('wazuh');
      expect(result.data.sourceType).toBe('WAZUH');
      expect(result.data.status).toBe('ACTIVE');
      expect(result.data.sortBy).toBe('name');
      expect(result.data.sortOrder).toBe('asc');
    }
  });

  it('rejects invalid page or limit', () => {
    const invalidPage = listEventSourcesQuerySchema.safeParse({ page: '0' });
    expect(invalidPage.success).toBe(false);

    const invalidLimit = listEventSourcesQuerySchema.safeParse({ limit: '200' });
    expect(invalidLimit.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const invalidStatus = listEventSourcesQuerySchema.safeParse({ status: 'UNKNOWN' });
    expect(invalidStatus.success).toBe(false);
  });
});
