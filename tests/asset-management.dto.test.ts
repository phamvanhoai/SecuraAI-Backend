import { describe, expect, it } from 'vitest';
import { listAssetsQuerySchema } from '../src/modules/asset-management/dto/list-assets-query.dto.js';
import { createAssetBodySchema } from '../src/modules/asset-management/dto/create-asset.dto.js';
import {
  updateAssetBodySchema,
  updateAssetParamsSchema,
} from '../src/modules/asset-management/dto/update-asset.dto.js';

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

describe('createAssetBodySchema', () => {
  it('normalizes the code, defaults criticality and removes blank optional text', () => {
    expect(
      createAssetBodySchema.parse({
        assetCode: ' ast-001 ',
        name: ' Database Server ',
        assetType: ' server ',
        hostname: '   ',
      }),
    ).toEqual({
      assetCode: 'AST-001',
      name: 'Database Server',
      assetType: 'server',
      criticality: 'medium',
    });
  });

  it.each([
    { assetCode: 'AST 001', name: 'Server', assetType: 'server' },
    { assetCode: 'AST-001', name: '', assetType: 'server' },
    { assetCode: 'AST-001', name: 'Server', assetType: 'server', status: 'retired' },
    { assetCode: 'AST-001', name: 'Server', assetType: 'server', ipAddress: '999.1.1.1' },
    { assetCode: 'AST-001', name: 'Server', assetType: 'server', metadata: [] },
  ])('rejects invalid create data: %o', (body) => {
    expect(createAssetBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('updateAsset schemas', () => {
  it('accepts partial updates and turns blank nullable text into null', () => {
    expect(updateAssetBodySchema.parse({ hostname: ' ', departmentId: null })).toEqual({
      hostname: null,
      departmentId: null,
    });
  });

  it.each([
    {},
    { assetCode: 'NEW-CODE' },
    { name: '' },
    { status: 'deleted' },
    { ipAddress: 'not-an-ip' },
  ])('rejects invalid update data: %o', (body) => {
    expect(updateAssetBodySchema.safeParse(body).success).toBe(false);
  });

  it('requires a valid asset UUID path parameter', () => {
    expect(
      updateAssetParamsSchema.safeParse({ assetId: '00000000-0000-4000-8000-000000000001' })
        .success,
    ).toBe(true);
    expect(updateAssetParamsSchema.safeParse({ assetId: 'bad-id' }).success).toBe(false);
  });
});
