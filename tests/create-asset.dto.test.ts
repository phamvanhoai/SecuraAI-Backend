import { describe, expect, it } from 'vitest';
import { createAssetBodySchema } from '../src/modules/it-asset-management/dto/create-asset.dto.js';

describe('createAssetBodySchema', () => {
  it.each(['criticality', 'dataClassification', 'businessServiceId'])('rejects deferred field %s', (field) => {
    expect(createAssetBodySchema.safeParse({ assetCode: 'AST-002', name: 'Server', assetType: 'server', [field]: null }).success).toBe(false);
  });
  it('normalizes a valid asset and supplies bounded relationship defaults', () => {
    expect(
      createAssetBodySchema.parse({
        assetCode: ' ast-002 ',
        name: ' App Server ',
        assetType: 'server',
      }),
    ).toMatchObject({
      assetCode: 'AST-002',
      name: 'App Server',
      dependencies: [],
      eventSourceIds: [],
    });
  });
  it('rejects duplicate relationships', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      createAssetBodySchema.safeParse({
        assetCode: 'AST-002',
        name: 'App Server',
        assetType: 'server',
        eventSourceIds: [id, id],
      }).success,
    ).toBe(false);
  });
});
