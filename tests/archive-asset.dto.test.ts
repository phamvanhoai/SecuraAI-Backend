import { describe, expect, it } from 'vitest';
import { archiveAssetBodySchema } from '../src/modules/it-asset-management/dto/archive-asset.dto.js';
describe('archive DTO', () => {
  it('trims reason', () => expect(archiveAssetBodySchema.parse({ confirmationCode: 'AST-TEST', reason: ' Retired after service migration ' })).toEqual({ confirmationCode: 'AST-TEST', reason: 'Retired after service migration' }));
  it.each([{}, { confirmationCode: 'AST-TEST', reason: null }, { confirmationCode: 'AST-TEST', reason: ' ' }, { confirmationCode: 'AST-TEST', reason: 'x'.repeat(1001) }, { confirmationCode: 'AST-TEST', reason: 'Retired after service migration', archivedBy: 'forged' }])('rejects invalid %j', (input) => {
    expect(archiveAssetBodySchema.safeParse(input).success).toBe(false);
  });
});
