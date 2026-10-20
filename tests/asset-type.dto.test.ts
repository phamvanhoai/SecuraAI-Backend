import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assetTypes } from '../src/modules/it-asset-management/dto/asset-type.dto.js';
import { createAssetBodySchema } from '../src/modules/it-asset-management/dto/create-asset.dto.js';
import { updateAssetBodySchema } from '../src/modules/it-asset-management/dto/update-asset.dto.js';
import { listAssetsQuerySchema } from '../src/modules/it-asset-management/dto/list-assets.dto.js';

describe('asset type allow-list', () => {
  it.each(assetTypes)('accepts %s across write and query boundaries', (assetType) => {
    const identity = { name: 'Demo asset', assetType };
    expect(createAssetBodySchema.parse(identity).assetType).toBe(assetType);
    expect(updateAssetBodySchema.parse({ ...identity, description: null }).assetType).toBe(assetType);
    expect(listAssetsQuerySchema.parse({ assetType }).assetType).toBe(assetType);
  });
  it.each(['', ' ', 'server', 'Database Server', 'abcxyz', 'CLOUD_RESOURCE', 'SERVER '])('rejects unsupported type %j', (assetType) => {
    const identity = { name: 'Demo asset', assetType };
    expect(createAssetBodySchema.safeParse(identity).success).toBe(false);
    expect(updateAssetBodySchema.safeParse({ ...identity, description: null }).success).toBe(false);
    expect(listAssetsQuerySchema.safeParse({ assetType }).success).toBe(false);
  });
  it('keeps the database constraint aligned and never silently maps unknown values to OTHER', () => {
    const sql = readFileSync('prisma/migrations/20261019093000_standardize_asset_types/migration.sql', 'utf8');
    const check = sql.split('CHECK (asset_type IN (')[1]?.split('))')[0];
    expect([...check?.matchAll(/'([^']+)'/g) ?? []].map((match) => match[1])).toEqual([...assetTypes]);
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).not.toContain("ELSE 'OTHER'");
    expect(sql).not.toMatch(/CREATE TABLE|ADD COLUMN/);
  });
});
