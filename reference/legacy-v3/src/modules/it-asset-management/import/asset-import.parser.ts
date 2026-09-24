import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { AppError } from '../../../common/errors/app-error.js';

export const assetImportHeaders = [
  'assetCode',
  'name',
  'assetType',
  'description',
  'departmentCode',
  'ownerEmployeeCode',
  'criticality',
  'hostname',
  'ipAddress',
  'location',
  'metadata',
] as const;

type AssetImportHeader = (typeof assetImportHeaders)[number];

export type ParsedAssetImportRow = {
  rowNumber: number;
  values: Record<AssetImportHeader, string>;
  formulaFields: AssetImportHeader[];
};

const requiredHeaders = new Set<AssetImportHeader>(['assetCode', 'name', 'assetType']);
const allowedHeaders = new Set<string>(assetImportHeaders);

const cellText = (cell: ExcelJS.Cell): { text: string; formula: boolean } => {
  const value = cell.value;
  if (value === null) return { text: '', formula: false };
  if (value instanceof Date) return { text: value.toISOString(), formula: false };
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return { text: '', formula: true };
    if ('richText' in value) {
      return {
        text: value.richText
          .map((part) => part.text)
          .join('')
          .trim(),
        formula: false,
      };
    }
    if ('hyperlink' in value) return { text: value.text.trim(), formula: false };
    return { text: cell.text.trim(), formula: false };
  }
  return { text: String(value).trim(), formula: false };
};

const readHeaders = (worksheet: ExcelJS.Worksheet): Map<number, AssetImportHeader> => {
  const headers = new Map<number, AssetImportHeader>();
  const seen = new Set<string>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const { text, formula } = cellText(cell);
    if (formula || !allowedHeaders.has(text) || seen.has(text)) {
      throw new AppError(422, 'INVALID_IMPORT_TEMPLATE', 'Excel template headers are invalid');
    }
    const header = text as AssetImportHeader;
    seen.add(header);
    headers.set(columnNumber, header);
  });
  if ([...requiredHeaders].some((header) => !seen.has(header))) {
    throw new AppError(422, 'INVALID_IMPORT_TEMPLATE', 'Required Excel columns are missing');
  }
  return headers;
};

export const parseAssetWorkbook = async (buffer: Buffer): Promise<ParsedAssetImportRow[]> => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.read(Readable.from(buffer));
  } catch {
    throw new AppError(422, 'INVALID_IMPORT_FILE', 'The uploaded Excel file could not be read');
  }
  const worksheet = workbook.getWorksheet('Assets') ?? workbook.worksheets[0];
  if (!worksheet) throw new AppError(422, 'INVALID_IMPORT_FILE', 'The workbook has no worksheet');
  const headers = readHeaders(worksheet);
  const rows: ParsedAssetImportRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = Object.fromEntries(assetImportHeaders.map((header) => [header, ''])) as Record<
      AssetImportHeader,
      string
    >;
    const formulaFields: AssetImportHeader[] = [];
    for (const [columnNumber, header] of headers) {
      const parsed = cellText(row.getCell(columnNumber));
      values[header] = parsed.text;
      if (parsed.formula) formulaFields.push(header);
    }
    if (Object.values(values).every((value) => value === '') && formulaFields.length === 0) return;
    rows.push({ rowNumber, values, formulaFields });
    if (rows.length > 1000) {
      throw new AppError(
        422,
        'IMPORT_ROW_LIMIT_EXCEEDED',
        'Import files may contain at most 1000 rows',
      );
    }
  });
  if (rows.length === 0) {
    throw new AppError(422, 'INVALID_IMPORT_FILE', 'The workbook contains no asset rows');
  }
  return rows;
};

export const createAssetImportTemplate = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Assets');
  worksheet.addRow([...assetImportHeaders]);
  worksheet.addRow([
    'AST-001',
    'Database Server',
    'server',
    'Production database',
    'IT',
    'EMP-001',
    'medium',
    'db-prod-01',
    '192.168.1.10',
    'Data Center A',
    '{"environment":"production"}',
  ]);
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns.forEach((column) => {
    column.width = 24;
  });
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
};
