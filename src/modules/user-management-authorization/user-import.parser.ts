import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { AppError } from '../../common/errors/app-error.js';

export const userImportHeaders = [
  'email',
  'fullName',
  'phone',
  'employeeCode',
  'departmentCode',
  'role',
] as const;

type UserImportHeader = (typeof userImportHeaders)[number];

export type ParsedUserImportRow = {
  rowNumber: number;
  values: Record<UserImportHeader, string>;
  formulaFields: UserImportHeader[];
};

const allowedHeaders = new Set<string>(userImportHeaders);
const requiredHeaders = new Set<UserImportHeader>(['email', 'fullName', 'role']);

function cellText(cell: ExcelJS.Cell): { text: string; formula: boolean } {
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
}

function readHeaders(worksheet: ExcelJS.Worksheet): Map<number, UserImportHeader> {
  const headers = new Map<number, UserImportHeader>();
  const seen = new Set<string>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const parsed = cellText(cell);
    if (parsed.formula || !allowedHeaders.has(parsed.text) || seen.has(parsed.text)) {
      throw new AppError(422, 'INVALID_IMPORT_TEMPLATE', 'Excel template headers are invalid');
    }
    const header = parsed.text as UserImportHeader;
    seen.add(header);
    headers.set(columnNumber, header);
  });
  if ([...requiredHeaders].some((header) => !seen.has(header))) {
    throw new AppError(422, 'INVALID_IMPORT_TEMPLATE', 'Required Excel columns are missing');
  }
  return headers;
}

export async function parseUserWorkbook(buffer: Buffer): Promise<ParsedUserImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.read(Readable.from(buffer));
  } catch {
    throw new AppError(422, 'INVALID_IMPORT_FILE', 'The uploaded Excel file could not be read');
  }
  const worksheet = workbook.getWorksheet('Users') ?? workbook.worksheets[0];
  if (!worksheet) throw new AppError(422, 'INVALID_IMPORT_FILE', 'The workbook has no worksheet');
  const headers = readHeaders(worksheet);
  const rows: ParsedUserImportRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = Object.fromEntries(userImportHeaders.map((header) => [header, ''])) as Record<
      UserImportHeader,
      string
    >;
    const formulaFields: UserImportHeader[] = [];
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
    throw new AppError(422, 'INVALID_IMPORT_FILE', 'The workbook contains no user rows');
  }
  return rows;
}
