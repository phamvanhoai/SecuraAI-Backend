import { describe, expect, it } from 'vitest';
import { listAssetsQuerySchema } from '../src/modules/asset-management/dto/list-assets-query.dto.js';
import { createAssetBodySchema } from '../src/modules/asset-management/dto/create-asset.dto.js';
import { classifyAssetCriticalityBodySchema } from '../src/modules/asset-management/dto/classify-asset-criticality.dto.js';
import { assignAssetOwnerBodySchema } from '../src/modules/asset-management/dto/assign-asset-owner.dto.js';
import { importAssetRowSchema } from '../src/modules/asset-management/dto/import-asset-row.dto.js';
import { exportAssetsQuerySchema } from '../src/modules/asset-management/dto/export-assets-query.dto.js';
import { listAssetHistoryQuerySchema } from '../src/modules/asset-management/dto/list-asset-history-query.dto.js';
import { assetHistoryActions } from '../src/modules/asset-management/dto/list-asset-history-query.dto.js';
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

  it('rejects empty and oversized search terms', () => {
    expect(listAssetsQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(listAssetsQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
  });
});

describe('exportAssetsQuerySchema', () => {
  it('uses list filter and sorting rules without pagination', () => {
    expect(
      exportAssetsQuerySchema.parse({ q: ' server ', status: 'active', sortBy: 'name' }),
    ).toEqual({ q: 'server', status: 'active', sortBy: 'name', sortOrder: 'asc' });
  });

  it.each([{ page: '1' }, { limit: '20' }, { status: 'deleted' }, { sortBy: 'metadata' }])(
    'rejects unsupported export query values: %o',
    (candidate) => expect(exportAssetsQuerySchema.safeParse(candidate).success).toBe(false),
  );
});

describe('listAssetHistoryQuerySchema', () => {
  it('applies pagination and newest-first defaults', () => {
    expect(listAssetHistoryQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
    });
  });

  it.each(assetHistoryActions)('accepts the supported %s action', (action) => {
    expect(listAssetHistoryQuerySchema.parse({ action }).action).toBe(action);
  });

  it('parses supported filters and inclusive UTC dates', () => {
    const result = listAssetHistoryQuerySchema.parse({
      page: '2',
      limit: '50',
      action: 'classified',
      changedByUserId: '00000000-0000-4000-8000-000000000001',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
      sortOrder: 'asc',
    });
    expect(result).toMatchObject({ page: 2, limit: 50, action: 'classified', sortOrder: 'asc' });
    expect(result.from?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(result.to?.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it.each([
    { page: '0' },
    { limit: '101' },
    { action: 'changed' },
    { changedByUserId: 'invalid' },
    { from: 'yesterday' },
    { sortOrder: 'newest' },
    { from: '2026-10-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
  ])('rejects invalid history filters: %o', (candidate) => {
    expect(listAssetHistoryQuerySchema.safeParse(candidate).success).toBe(false);
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

describe('importAssetRowSchema', () => {
  const row = {
    assetCode: ' ast-import-001 ',
    name: ' Imported Server ',
    assetType: ' server ',
    description: '',
    departmentCode: '',
    ownerEmployeeCode: '',
    criticality: '',
    hostname: '',
    ipAddress: '',
    location: '',
    metadata: '{"environment":"test"}',
  };

  it('normalizes Excel text, defaults criticality and parses metadata', () => {
    expect(importAssetRowSchema.parse(row)).toEqual({
      assetCode: 'AST-IMPORT-001',
      name: 'Imported Server',
      assetType: 'server',
      description: undefined,
      departmentCode: undefined,
      ownerEmployeeCode: undefined,
      criticality: 'medium',
      hostname: undefined,
      ipAddress: undefined,
      location: undefined,
      metadata: { environment: 'test' },
    });
  });

  it.each([
    { ...row, assetCode: 'BAD CODE' },
    { ...row, ipAddress: '999.1.1.1' },
    { ...row, criticality: 'urgent' },
    { ...row, metadata: '[]' },
    { ...row, metadata: '{not-json}' },
  ])('rejects invalid imported row data', (candidate) => {
    expect(importAssetRowSchema.safeParse(candidate).success).toBe(false);
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
    { criticality: 'critical' },
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

describe('classifyAssetCriticalityBodySchema', () => {
  it('accepts four integer impact scores and trims the reason', () => {
    expect(
      classifyAssetCriticalityBodySchema.parse({
        confidentialityImpact: 4,
        integrityImpact: 5,
        availabilityImpact: 5,
        businessImpact: 4,
        reason: '  Production customer database  ',
      }),
    ).toEqual({
      confidentialityImpact: 4,
      integrityImpact: 5,
      availabilityImpact: 5,
      businessImpact: 4,
      reason: 'Production customer database',
    });
  });

  it.each([
    {
      confidentialityImpact: 0,
      integrityImpact: 3,
      availabilityImpact: 3,
      businessImpact: 3,
      reason: 'Reason',
    },
    {
      confidentialityImpact: 3,
      integrityImpact: 6,
      availabilityImpact: 3,
      businessImpact: 3,
      reason: 'Reason',
    },
    {
      confidentialityImpact: 3.5,
      integrityImpact: 3,
      availabilityImpact: 3,
      businessImpact: 3,
      reason: 'Reason',
    },
    {
      confidentialityImpact: 3,
      integrityImpact: 3,
      availabilityImpact: 3,
      businessImpact: 3,
      reason: ' ',
    },
    {
      confidentialityImpact: 3,
      integrityImpact: 3,
      availabilityImpact: 3,
      businessImpact: 3,
      reason: 'Reason',
      criticality: 'critical',
    },
  ])('rejects invalid classification data: %o', (body) => {
    expect(classifyAssetCriticalityBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('assignAssetOwnerBodySchema', () => {
  it('accepts an owner UUID or null and trims the mandatory reason', () => {
    expect(
      assignAssetOwnerBodySchema.parse({
        ownerUserId: '00000000-0000-4000-8000-000000000020',
        reason: '  Infrastructure responsibility  ',
      }),
    ).toEqual({
      ownerUserId: '00000000-0000-4000-8000-000000000020',
      reason: 'Infrastructure responsibility',
    });
    expect(
      assignAssetOwnerBodySchema.safeParse({ ownerUserId: null, reason: 'Unassign owner' }).success,
    ).toBe(true);
  });

  it.each([
    { reason: 'Missing owner field' },
    { ownerUserId: 'not-a-uuid', reason: 'Invalid owner' },
    { ownerUserId: null, reason: ' ' },
    { ownerUserId: null, reason: 'Unassign', departmentId: null },
  ])('rejects invalid assignment data: %o', (body) => {
    expect(assignAssetOwnerBodySchema.safeParse(body).success).toBe(false);
  });
});
