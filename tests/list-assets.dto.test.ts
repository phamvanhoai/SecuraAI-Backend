import { describe, expect, it } from 'vitest';
import { listAssetsQuerySchema } from '../src/modules/it-asset-management/dto/list-assets.dto.js';
describe('list assets query', () => {
  it('applies bounded defaults', () => expect(listAssetsQuerySchema.parse({})).toMatchObject({ page: 1, limit: 10, sortBy: 'assetCode', sortOrder: 'asc' }));
  it('accepts supported filters', () => expect(listAssetsQuerySchema.safeParse({ q: 'server', status: 'active', criticality: 'critical', assetType: 'Server' }).success).toBe(true));
  it('rejects an excessive page size', () => expect(listAssetsQuerySchema.safeParse({ limit: 101 }).success).toBe(false));
});
