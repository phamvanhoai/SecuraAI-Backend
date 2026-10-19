import { describe, expect, it } from 'vitest';
import { createAssetBodySchema } from '../src/modules/it-asset-management/dto/create-asset.dto.js';

describe('createAssetBodySchema', () => {
  it.each(['criticality', 'dataClassification', 'businessServiceId'])('rejects deferred field %s', (field) => {
    expect(createAssetBodySchema.safeParse({ name: 'Server', assetType: 'SERVER', [field]: null }).success).toBe(false);
  });
  it('normalizes a valid asset and supplies bounded relationship defaults', () => {
    expect(
      createAssetBodySchema.parse({
        name: ' App Server ',
        assetType: 'SERVER',
      }),
    ).toMatchObject({
      name: 'App Server',
      dependencies: [],
      eventSourceIds: [],
    });
  });
  it('rejects a caller-supplied asset code', () => {
    expect(createAssetBodySchema.safeParse({
      assetCode: 'AST-MANUAL',
      name: 'App Server',
      assetType: 'SERVER',
    }).success).toBe(false);
  });
  it('rejects duplicate relationships', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      createAssetBodySchema.safeParse({
        name: 'App Server',
        assetType: 'SERVER',
        eventSourceIds: [id, id],
      }).success,
    ).toBe(false);
  });
});
