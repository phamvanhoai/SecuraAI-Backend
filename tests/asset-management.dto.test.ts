import { describe, expect, it } from 'vitest';
import { listAssetsQuerySchema } from '../src/modules/asset-management/dto/list-assets-query.dto.js';

describe('listAssetsQuerySchema', () => {
  it('applies bounded pagination and sorting defaults', () => {
    expect(listAssetsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortBy: 'assetCode',
      sortOrder: 'asc',
    });
  });

  it('coerces valid pagination and accepts supported filters', () => {
    expect(
      listAssetsQuerySchema.parse({
        page: '2',
        limit: '50',
        q: '  server  ',
        criticality: 'critical',
        status: 'active',
      }),
    ).toMatchObject({
      page: 2,
      limit: 50,
      q: 'server',
      criticality: 'critical',
      status: 'active',
    });
  });

  it.each([
    { page: '0' },
    { limit: '101' },
    { criticality: 'urgent' },
    { status: 'deleted' },
    { sortBy: 'metadata' },
    { departmentId: 'not-a-uuid' },
  ])('rejects invalid query values: %o', (query) => {
    expect(listAssetsQuerySchema.safeParse(query).success).toBe(false);
  });
});
