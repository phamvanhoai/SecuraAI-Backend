import { describe, expect, it } from 'vitest';
import { archiveAssetBodySchema } from '../src/modules/it-asset-management/dto/archive-asset.dto.js';
describe('archive DTO', () => {
  it('trims reason', () => expect(archiveAssetBodySchema.parse({ reason: ' Retired ' })).toEqual({ reason: 'Retired' }));
  it.each([{}, { reason: null }, { reason: ' ' }, { reason: 'x'.repeat(1001) }, { reason: 'Retired', archivedBy: 'forged' }])('rejects invalid %j', (input) => {
    expect(archiveAssetBodySchema.safeParse(input).success).toBe(false);
  });
});
