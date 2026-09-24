import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  assetImportHeaders,
  createAssetImportTemplate,
  parseAssetWorkbook,
} from '../src/modules/asset-management/import/asset-import.parser.js';

const workbookBuffer = async (headers: string[], values: ExcelJS.CellValue[]): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Assets');
  sheet.addRow(headers);
  sheet.addRow(values);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const workbookWithRows = async (
  headers: string[],
  rows: ExcelJS.CellValue[][],
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Assets');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('asset import workbook parser', () => {
  it('creates a template that can be parsed using the approved columns', async () => {
    const rows = await parseAssetWorkbook(await createAssetImportTemplate());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.values).toMatchObject({
      assetCode: 'AST-001',
      name: 'Database Server',
      assetType: 'server',
    });
  });

  it('rejects a template missing a required column', async () => {
    const buffer = await workbookBuffer(['assetCode', 'name'], ['AST-001', 'Server']);

    await expect(parseAssetWorkbook(buffer)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_IMPORT_TEMPLATE',
    });
  });

  it.each([
    [['assetCode', 'name', 'assetType', 'unknownColumn'], 'unknown header'],
    [['assetCode', 'name', 'assetType', 'name'], 'duplicate header'],
  ])('rejects an invalid template with an %s', async (headers) => {
    const buffer = await workbookBuffer(headers, ['AST-001', 'Server', 'server', 'value']);

    await expect(parseAssetWorkbook(buffer)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_IMPORT_TEMPLATE',
    });
  });

  it('rejects an empty workbook and unreadable content', async () => {
    const empty = await workbookWithRows([...assetImportHeaders], []);

    await expect(parseAssetWorkbook(empty)).rejects.toMatchObject({
      code: 'INVALID_IMPORT_FILE',
    });
    await expect(parseAssetWorkbook(Buffer.from('not-an-xlsx'))).rejects.toMatchObject({
      code: 'INVALID_IMPORT_FILE',
    });
  });

  it('skips blank rows and enforces the 1000-row limit', async () => {
    const blankAndValid = await workbookWithRows(
      [...assetImportHeaders],
      [[], ['AST-VALID', 'Server', 'server']],
    );
    const excessive = await workbookWithRows(
      [...assetImportHeaders],
      Array.from({ length: 1001 }, (_, index) => [`AST-${index}`, 'Server', 'server']),
    );

    await expect(parseAssetWorkbook(blankAndValid)).resolves.toHaveLength(1);
    await expect(parseAssetWorkbook(excessive)).rejects.toMatchObject({
      code: 'IMPORT_ROW_LIMIT_EXCEEDED',
    });
  });

  it('reports formula cells so they can be rejected as row errors', async () => {
    const values: ExcelJS.CellValue[] = assetImportHeaders.map(() => '');
    values[0] = 'AST-FORMULA';
    values[1] = { formula: 'CONCAT("Serv","er")', result: 'Server' };
    values[2] = 'server';
    const rows = await parseAssetWorkbook(await workbookBuffer([...assetImportHeaders], values));

    expect(rows[0]?.formulaFields).toEqual(['name']);
  });
});
