import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findForExportMock, recordExportMock } = vi.hoisted(() => ({
  findForExportMock: vi.fn(),
  recordExportMock: vi.fn(),
}));

vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: {
    findForExport: findForExportMock,
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
    const worksheet = workbook.getWorksheet('Assets');

    expect(result.filename).toMatch(/^assets-\d{8}-\d{6}\.xlsx$/);
    expect(result.exportedRows).toBe(1);
    expect(worksheet?.getRow(1).values).toEqual([
      undefined,
      'Asset Code',
      'Name',
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
    expect(worksheet?.getCell('B2').value).toBe("'=DANGEROUS()");
    expect(worksheet?.getCell('D2').value).toBe("'+SUM(1,2)");
    expect(worksheet?.getCell('K2').value).toBe("'-DANGEROUS()");
    expect(worksheet?.getCell('M2').value).toBe("'@SERVER-ROOM");
    expect(worksheet?.getCell('N2').value).toBe('{"environment":"production"}');
    expect(worksheet?.getCell('O2').value).toBe('2026-09-09T10:00:00.000Z');
    expect(worksheet?.getCell('B2').type).toBe(ExcelJS.ValueType.String);
    expect(worksheet?.getCell('D2').type).toBe(ExcelJS.ValueType.String);
    expect(worksheet?.getCell('K2').type).toBe(ExcelJS.ValueType.String);
    expect(recordExportMock).toHaveBeenCalledWith(
      { format: 'xlsx', exportedRows: 1, filters: query },
      { actorUserId: 'user-1', ...context },
    );
  });

  it('returns a header-only workbook when no assets match', async () => {
    findForExportMock.mockResolvedValue([]);
    const result = await assetExportService.exportAssets(query, actor, context);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from(result.buffer));

    expect(result.exportedRows).toBe(0);
    expect(workbook.getWorksheet('Assets')?.rowCount).toBe(1);
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
});
