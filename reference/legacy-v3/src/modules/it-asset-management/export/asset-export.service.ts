import ExcelJS from 'exceljs';
import { AppError } from '../../../common/errors/app-error.js';
import { assetManagementRepository } from '../asset-management.repository.js';
import type { ExportAssetsQuery } from '../dto/export-assets-query.dto.js';

const exportLimit = 10_000;
const formulaPrefix = /^[=+\-@]/;
const colors = {
  navy: 'FF123B5D',
  blue: 'FF1565A8',
  paleBlue: 'FFEAF3F8',
  lighterBlue: 'FFF5F9FC',
  white: 'FFFFFFFF',
  border: 'FFB8C7D1',
  darkText: 'FF1F2937',
  critical: 'FFF4CCCC',
  high: 'FFFCE5CD',
  medium: 'FFFFF2CC',
  low: 'FFD9EAD3',
  active: 'FFD9EAD3',
  inactive: 'FFE7E6E6',
  retired: 'FFD9E2F3',
  disposed: 'FFF4CCCC',
} as const;
const criticalityColors: Readonly<Record<string, string>> = {
  critical: colors.critical,
  high: colors.high,
  medium: colors.medium,
  low: colors.low,
};
const statusColors: Readonly<Record<string, string>> = {
  active: colors.active,
  inactive: colors.inactive,
  retired: colors.retired,
  disposed: colors.disposed,
};

type ExportActor = { userId: string; permissions: readonly string[] };
type ExportContext = { ipAddress: string | null; userAgent: string | null };
type OrganizationProfile = { name: string; address: string; phone: string };
type ExportMetadata = {
  organization: OrganizationProfile;
  exportedBy: string;
  exporterRoles: readonly string[];
  exportedAt: Date;
};

const safeText = (value: string | null): string => {
  if (value === null) return '';
  return formulaPrefix.test(value) ? `'${value}` : value;
};

const fileTimestamp = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${valueOf('year')}${valueOf('month')}${valueOf('day')}_${valueOf('hour')}${valueOf('minute')}${valueOf('second')}`;
};

const exportedAtText = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);

const parseOrganizationProfile = (value: unknown): OrganizationProfile | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (
    typeof profile.name !== 'string' ||
    typeof profile.address !== 'string' ||
    typeof profile.phone !== 'string' ||
    profile.name.trim().length === 0 ||
    profile.address.trim().length === 0 ||
    profile.phone.trim().length === 0
  ) {
    return null;
  }
  return {
    name: profile.name.trim(),
    address: profile.address.trim(),
    phone: profile.phone.trim(),
  };
};

const createWorkbook = async (
  assets: Awaited<ReturnType<typeof assetManagementRepository.findForExport>>,
  metadata: ExportMetadata,
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SecuraAI';
  workbook.created = metadata.exportedAt;
  workbook.modified = metadata.exportedAt;
  const worksheet = workbook.addWorksheet('Asset Inventory', {
    views: [{ state: 'frozen', ySplit: 8 }],
  });
  worksheet.properties.defaultRowHeight = 20;
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    blackAndWhite: true,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  worksheet.headerFooter.oddFooter = '&LSecuraAI&CPage &P / &N&RAsset Management Report';
  worksheet.columns = [
    { key: 'serialNumber', width: 8 },
    { key: 'assetCode', width: 22 },
    { key: 'name', width: 32 },
    { key: 'assetType', width: 18 },
    { key: 'description', width: 40 },
    { key: 'criticality', width: 15 },
    { key: 'status', width: 15 },
    { key: 'departmentCode', width: 20 },
    { key: 'departmentName', width: 28 },
    { key: 'ownerEmployeeCode', width: 22 },
    { key: 'ownerName', width: 28 },
    { key: 'hostname', width: 26 },
    { key: 'ipAddress', width: 22 },
    { key: 'location', width: 25 },
    { key: 'metadata', width: 40 },
    { key: 'createdAt', width: 26 },
    { key: 'updatedAt', width: 26 },
  ];
  worksheet.mergeCells('A1:Q1');
  worksheet.getCell('A1').value = 'SECURAAI  |  ASSET MANAGEMENT';
  worksheet.getCell('A1').font = { bold: true, size: 12, color: { argb: colors.white } };
  worksheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: colors.navy },
  };
  worksheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  worksheet.getRow(1).height = 25;
  worksheet.mergeCells('A2:Q2');
  worksheet.getCell('A2').value = 'INFORMATION TECHNOLOGY ASSET INVENTORY REPORT';
  worksheet.getCell('A2').font = { bold: true, size: 18, color: { argb: colors.navy } };
  worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 34;
  worksheet.mergeCells('A3:Q3');
  worksheet.getCell('A3').value = `Organization: ${safeText(metadata.organization.name)}`;
  worksheet.mergeCells('A4:Q4');
  worksheet.getCell('A4').value = `Address: ${safeText(metadata.organization.address)}`;
  worksheet.mergeCells('A5:Q5');
  worksheet.getCell('A5').value = `Phone: ${safeText(metadata.organization.phone)}`;
  worksheet.mergeCells('A6:H6');
  worksheet.getCell('A6').value = `Exported at: ${exportedAtText(metadata.exportedAt)}`;
  worksheet.mergeCells('I6:Q6');
  worksheet.getCell('I6').value = `Total assets: ${assets.length}`;
  for (let rowNumber = 3; rowNumber <= 6; rowNumber += 1) {
    const cell = worksheet.getCell(`A${rowNumber}`);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.paleBlue } };
    cell.font = { bold: rowNumber === 2, color: { argb: colors.darkText } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: colors.border } } };
  }
  worksheet.getCell('I6').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: colors.paleBlue },
  };
  worksheet.getCell('I6').font = { bold: true, color: { argb: colors.darkText } };
  worksheet.getCell('I6').alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell('I6').border = {
    bottom: { style: 'thin', color: { argb: colors.border } },
  };
  worksheet.getRow(4).height = 30;

  const headerRow = worksheet.getRow(8);
  headerRow.values = [
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
  ];
  headerRow.height = 30;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: colors.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.blue } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: colors.border } },
      left: { style: 'thin', color: { argb: colors.border } },
      bottom: { style: 'thin', color: { argb: colors.border } },
      right: { style: 'thin', color: { argb: colors.border } },
    };
  });
  worksheet.autoFilter = { from: 'A8', to: 'Q8' };

  for (const [index, asset] of assets.entries()) {
    const row = worksheet.addRow({
      serialNumber: index + 1,
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
      createdAt: asset.created_at,
      updatedAt: asset.updated_at,
    });
    row.alignment = { vertical: 'top', wrapText: true };
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = '@';
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: row.number % 2 === 0 ? colors.white : colors.lighterBlue },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: colors.border } },
        left: { style: 'thin', color: { argb: colors.border } },
        bottom: { style: 'thin', color: { argb: colors.border } },
        right: { style: 'thin', color: { argb: colors.border } },
      };
    });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(16).numFmt = 'dd-mmm-yyyy hh:mm:ss';
    row.getCell(17).numFmt = 'dd-mmm-yyyy hh:mm:ss';
    const criticalityColor = criticalityColors[asset.criticality];
    if (criticalityColor) {
      row.getCell(6).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: criticalityColor },
      };
      row.getCell(6).font = { bold: true };
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    const statusColor = statusColors[asset.status];
    if (statusColor) {
      row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColor } };
      row.getCell(7).font = { bold: true };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }
  const exporterRow = worksheet.rowCount + 2;
  worksheet.mergeCells(`A${exporterRow}:Q${exporterRow}`);
  const exporterRoleText = metadata.exporterRoles.join(', ');
  worksheet.getCell(`A${exporterRow}`).value =
    `Exported by: ${safeText(exporterRoleText)} - ${safeText(metadata.exportedBy)}`;
  worksheet.getCell(`A${exporterRow}`).font = { bold: true, color: { argb: colors.navy } };
  worksheet.getCell(`A${exporterRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: colors.paleBlue },
  };
  worksheet.getCell(`A${exporterRow}`).alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getCell(`A${exporterRow}`).border = {
    top: { style: 'medium', color: { argb: colors.blue } },
  };
  worksheet.getRow(exporterRow).height = 26;
  worksheet.pageSetup.printTitlesRow = '8:8';
  worksheet.pageSetup.printArea = `A1:Q${exporterRow}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const assetExportService = {
  async exportAssets(query: ExportAssetsQuery, actor: ExportActor, context: ExportContext) {
    if (!actor.permissions.includes('assets.export')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    const exportedAt = new Date();
    const [assets, metadataRecord] = await Promise.all([
      assetManagementRepository.findForExport(query, exportLimit + 1),
      assetManagementRepository.findExportMetadata(actor.userId),
    ]);
    if (assets.length > exportLimit) {
      throw new AppError(
        422,
        'EXPORT_ROW_LIMIT_EXCEEDED',
        `Asset exports may contain at most ${exportLimit} rows`,
      );
    }
    if (!metadataRecord.exporter) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    const organization = parseOrganizationProfile(
      metadataRecord.organizationProfile?.setting_value,
    );
    if (!organization) {
      throw new AppError(
        500,
        'EXPORT_CONFIGURATION_MISSING',
        'Organization export information is not configured',
      );
    }
    let buffer: Buffer;
    try {
      buffer = await createWorkbook(assets, {
        organization,
        exportedBy: metadataRecord.exporter.full_name,
        exporterRoles: metadataRecord.exporter.user_roles_user_roles_user_idTousers.map(
          ({ roles }) => roles.name,
        ),
        exportedAt,
      });
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
      filename: `SecuraAI_Asset_Inventory_${fileTimestamp(exportedAt)}.xlsx`,
      exportedRows: assets.length,
    };
  },
};
