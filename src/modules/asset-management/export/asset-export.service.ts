import ExcelJS from 'exceljs';
import { AppError } from '../../../common/errors/app-error.js';
import { assetManagementRepository } from '../asset-management.repository.js';
import type { ExportAssetsQuery } from '../dto/export-assets-query.dto.js';

const exportLimit = 10_000;
const formulaPrefix = /^[=+\-@]/;

type ExportActor = { userId: string; permissions: readonly string[] };
type ExportContext = { ipAddress: string | null; userAgent: string | null };

const safeText = (value: string | null): string => {
  if (value === null) return '';
  return formulaPrefix.test(value) ? `'${value}` : value;
};

const fileTimestamp = (date: Date): string =>
  date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

const createWorkbook = async (
  assets: Awaited<ReturnType<typeof assetManagementRepository.findForExport>>,
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Assets', { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = [
    { header: 'Asset Code', key: 'assetCode', width: 22 },
    { header: 'Name', key: 'name', width: 32 },
    { header: 'Asset Type', key: 'assetType', width: 18 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Criticality', key: 'criticality', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Department Code', key: 'departmentCode', width: 20 },
    { header: 'Department Name', key: 'departmentName', width: 28 },
    { header: 'Owner Employee Code', key: 'ownerEmployeeCode', width: 22 },
    { header: 'Owner Name', key: 'ownerName', width: 28 },
    { header: 'Hostname', key: 'hostname', width: 26 },
    { header: 'IP Address', key: 'ipAddress', width: 22 },
    { header: 'Location', key: 'location', width: 25 },
    { header: 'Metadata', key: 'metadata', width: 40 },
    { header: 'Created At', key: 'createdAt', width: 26 },
    { header: 'Updated At', key: 'updatedAt', width: 26 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.autoFilter = { from: 'A1', to: 'P1' };

  for (const asset of assets) {
    worksheet.addRow({
      assetCode: safeText(asset.asset_code),
      name: safeText(asset.name),
      assetType: safeText(asset.asset_type),
      description: safeText(asset.description),
      criticality: safeText(asset.criticality),
      status: safeText(asset.status),
      departmentCode: safeText(asset.departments?.code ?? null),
      departmentName: safeText(asset.departments?.name ?? null),
      ownerEmployeeCode: safeText(asset.users_assets_owner_user_idTousers?.employee_code ?? null),
      ownerName: safeText(asset.users_assets_owner_user_idTousers?.full_name ?? null),
      hostname: safeText(asset.hostname),
      ipAddress: safeText(asset.ip_address),
      location: safeText(asset.location),
      metadata: safeText(JSON.stringify(asset.metadata ?? {})),
      createdAt: asset.created_at.toISOString(),
      updatedAt: asset.updated_at.toISOString(),
    });
  }
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.eachCell({ includeEmpty: true }, (cell) => (cell.numFmt = '@'));
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const assetExportService = {
  async exportAssets(query: ExportAssetsQuery, actor: ExportActor, context: ExportContext) {
    if (!actor.permissions.includes('assets.export')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    const assets = await assetManagementRepository.findForExport(query, exportLimit + 1);
    if (assets.length > exportLimit) {
      throw new AppError(
        422,
        'EXPORT_ROW_LIMIT_EXCEEDED',
        `Asset exports may contain at most ${exportLimit} rows`,
      );
    }
    let buffer: Buffer;
    try {
      buffer = await createWorkbook(assets);
    } catch {
      throw new AppError(
        500,
        'EXPORT_GENERATION_FAILED',
        'The asset Excel file could not be created',
      );
    }
    await assetManagementRepository.recordExport(
      { format: 'xlsx', exportedRows: assets.length, filters: query },
      { actorUserId: actor.userId, ...context },
    );
    return {
      buffer,
      filename: `assets-${fileTimestamp(new Date())}.xlsx`,
      exportedRows: assets.length,
    };
  },
};
