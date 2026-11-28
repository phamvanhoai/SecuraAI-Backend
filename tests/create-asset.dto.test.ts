import { describe, expect, it } from 'vitest';
import { createAssetBodySchema } from '../src/modules/it-asset-management/dto/create-asset.dto.js';

describe('createAssetBodySchema', () => {
  it.each(['criticality', 'dataClassification', 'businessServiceId', 'dependencies', 'eventSourceIds'])('rejects deferred field %s', (field) => {
    expect(createAssetBodySchema.safeParse({ name: 'Server', assetType: 'SERVER', [field]: null }).success).toBe(false);
  });
  it('normalizes identity without adding relationship fields', () => {
    expect(
      createAssetBodySchema.parse({
        name: ' App Server ',
        assetType: 'SERVER',
      }),
    ).toEqual({
      name: 'App Server',
      assetType: 'SERVER',
    });
  });
  it('rejects a caller-supplied asset code', () => {
    expect(createAssetBodySchema.safeParse({
      assetCode: 'AST-MANUAL',
      name: 'App Server',
      assetType: 'SERVER',
    }).success).toBe(false);
  });
  it.each(['dependencies', 'eventSourceIds'])('rejects legacy %s even when empty', (field) => {
    expect(createAssetBodySchema.safeParse({
      name: 'App Server', assetType: 'SERVER', [field]: [],
    }).success).toBe(false);
  });
});
