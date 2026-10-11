import { describe, expect, it } from 'vitest';
import { updateAssetBodySchema } from '../src/modules/it-asset-management/dto/update-asset.dto.js';

describe('updateAssetBodySchema', () => {
  it('accepts only editable asset identity fields', () => {
    expect(updateAssetBodySchema.parse({ name: ' Core Server ', assetType: ' Server ', description: null })).toEqual({ name: 'Core Server', assetType: 'Server', description: null });
  });
  it('rejects ownership and relationship changes', () => {
    expect(updateAssetBodySchema.safeParse({ name: 'Core Server', assetType: 'Server', description: null, ownerUserId: null }).success).toBe(false);
  });
});
