import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findForExportMock, findExportMetadataMock, recordExportMock } = vi.hoisted(() => ({
  findForExportMock: vi.fn(),
  findExportMetadataMock: vi.fn(),
  recordExportMock: vi.fn(),
}));

vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: {
    findForExport: findForExportMock,
    findExportMetadata: findExportMetadataMock,
    recordExport: recordExportMock,
  },
}));

import { assetExportService } from '../src/modules/asset-management/export/asset-export.service.js';

const actor = { userId: 'user-1', permissions: ['assets.export'] };
const context = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
const query = { sortBy: 'assetCode' as const, sortOrder: 'asc' as const };
const asset = {
  asset_code: 'AST-001',
  name: '=DANGEROUS()',
  asset_type: 'server',
  description: '+SUM(1,2)',
  criticality: 'high',
  status: 'active',
  hostname: '-DANGEROUS()',
  ip_address: '192.168.1.10',
  location: '@SERVER-ROOM',
  metadata: { environment: 'production' },
  created_at: new Date('2026-09-09T10:00:00.000Z'),
  updated_at: new Date('2026-09-09T11:00:00.000Z'),
  departments: { code: 'IT', name: 'Information Technology' },
  users_assets_owner_user_idTousers: { employee_code: 'EMP-001', full_name: 'Owner' },
};

describe('assetExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findForExportMock.mockResolvedValue([asset]);
    findExportMetadataMock.mockResolvedValue({
      exporter: {
        full_name: 'Nguyễn Văn A',
        user_roles_user_roles_user_idTousers: [{ roles: { name: 'Security Officer' } }],
      },
      organizationProfile: {
        setting_value: {
          name: 'SecuraAI',
          address:
            '600 Nguyen Van Cu Extension Street, An Binh Ward, Ninh Kieu District, Can Tho City, ZIP Code: 900000',
          phone: '0292 730 3636',
        },
      },
    });
    recordExportMock.mockResolvedValue(undefined);
  });

  it('requires the assets.export permission', async () => {
    await expect(
      assetExportService.exportAssets(query, { userId: 'user-1', permissions: [] }, context),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(findForExportMock).not.toHaveBeenCalled();
  });

  it('exports the approved columns, formats values as text and records an audit', async () => {
    const result = await assetExportService.exportAssets(query, actor, context);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from(result.buffer));
    const worksheet = workbook.getWorksheet('Asset Inventory');

    expect(result.filename).toMatch(/^SecuraAI_Asset_Inventory_\d{8}_\d{6}\.xlsx$/);
    expect(result.exportedRows).toBe(1);
    expect(worksheet?.getCell('A1').value).toBe('SECURAAI  |  ASSET MANAGEMENT');
    expect(worksheet?.getCell('A2').value).toBe('INFORMATION TECHNOLOGY ASSET INVENTORY REPORT');
    expect(worksheet?.getCell('A3').value).toBe('Organization: SecuraAI');
    expect(worksheet?.getCell('A4').value).toBe(
      'Address: 600 Nguyen Van Cu Extension Street, An Binh Ward, Ninh Kieu District, Can Tho City, ZIP Code: 900000',
    );
    expect(worksheet?.getCell('A5').value).toBe('Phone: 0292 730 3636');
    expect(worksheet?.getCell('A6').value).toMatch(/^Exported at: /);
    expect(worksheet?.getCell('I6').value).toBe('Total assets: 1');
    expect(worksheet?.getCell('A1').fill).toMatchObject({
      pattern: 'solid',
      fgColor: { argb: 'FF123B5D' },
    });
    expect(worksheet?.getCell('A8').fill).toMatchObject({
      pattern: 'solid',
      fgColor: { argb: 'FF1565A8' },
    });
    expect(worksheet?.getRow(8).values).toEqual([
      undefined,
      'No.',
      'Asset Code',
      'Asset Name',
      'Asset Type',
      'Description',
      'Criticality',
      'Status',
      'Department Code',
      'Department Name',
      'Owner Employee Code',
      'Owner Name',
      'Hostname',
      'IP Address',
      'Location',
      'Metadata',
      'Created At',
      'Updated At',
    ]);
    expect(worksheet?.getCell('A9').value).toBe(1);
    expect(worksheet?.getCell('C9').value).toBe("'=DANGEROUS()");
    expect(worksheet?.getCell('E9').value).toBe("'+SUM(1,2)");
    expect(worksheet?.getCell('L9').value).toBe("'-DANGEROUS()");
    expect(worksheet?.getCell('N9').value).toBe("'@SERVER-ROOM");
    expect(worksheet?.getCell('O9').value).toBe('{"environment":"production"}');
    expect(worksheet?.getCell('P9').value).toEqual(new Date('2026-09-09T10:00:00.000Z'));
    expect(worksheet?.getCell('F9').fill).toMatchObject({ fgColor: { argb: 'FFFCE5CD' } });
    expect(worksheet?.getCell('G9').fill).toMatchObject({ fgColor: { argb: 'FFD9EAD3' } });
    expect(worksheet?.getCell('A11').value).toBe('Exported by: Security Officer - Nguyễn Văn A');
    expect(worksheet?.getCell('A11').alignment).toMatchObject({
      horizontal: 'left',
      vertical: 'middle',
    });
    expect(worksheet?.pageSetup.orientation).toBe('landscape');
    expect(worksheet?.pageSetup.fitToWidth).toBe(1);
    expect(worksheet?.pageSetup.blackAndWhite).toBe(true);
    expect(worksheet?.headerFooter.oddFooter).toContain('SecuraAI');
    expect(worksheet?.getCell('C9').type).toBe(ExcelJS.ValueType.String);
    expect(worksheet?.getCell('E9').type).toBe(ExcelJS.ValueType.String);
    expect(worksheet?.getCell('L9').type).toBe(ExcelJS.ValueType.String);
    expect(recordExportMock).toHaveBeenCalledWith(
      { format: 'xlsx', exportedRows: 1, filters: query },
      { actorUserId: 'user-1', ...context },
    );
  });

  it('returns report metadata, headers and exporter when no assets match', async () => {
    findForExportMock.mockResolvedValue([]);
    const result = await assetExportService.exportAssets(query, actor, context);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from(result.buffer));

    expect(result.exportedRows).toBe(0);
    expect(workbook.getWorksheet('Asset Inventory')?.getCell('A8').value).toBe('No.');
    expect(workbook.getWorksheet('Asset Inventory')?.getCell('I6').value).toBe('Total assets: 0');
    expect(workbook.getWorksheet('Asset Inventory')?.getCell('A10').value).toBe(
      'Exported by: Security Officer - Nguyễn Văn A',
    );
    expect(recordExportMock).toHaveBeenCalledOnce();
  });

  it('rejects results above 10000 rows without writing an audit', async () => {
    findForExportMock.mockResolvedValue(Array.from({ length: 10_001 }, () => asset));

    await expect(assetExportService.exportAssets(query, actor, context)).rejects.toMatchObject({
      statusCode: 422,
      code: 'EXPORT_ROW_LIMIT_EXCEEDED',
    });
    expect(recordExportMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid organization profile', async () => {
    findExportMetadataMock.mockResolvedValue({
      exporter: {
        full_name: 'Nguyễn Văn A',
        user_roles_user_roles_user_idTousers: [{ roles: { name: 'Security Officer' } }],
      },
      organizationProfile: { setting_value: { name: 'SecuraAI' } },
    });

    await expect(assetExportService.exportAssets(query, actor, context)).rejects.toMatchObject({
      statusCode: 500,
      code: 'EXPORT_CONFIGURATION_MISSING',
    });
    expect(recordExportMock).not.toHaveBeenCalled();
  });
});
