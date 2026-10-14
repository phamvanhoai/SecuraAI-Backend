import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseUserWorkbook } from '../src/modules/user-management-authorization/user-import.parser.js';

async function workbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Users');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('user import parser', () => {
  it('parses supported user columns and row numbers', async () => {
    const buffer = await workbookBuffer([
      ['email', 'fullName', 'phone', 'employeeCode', 'departmentCode', 'role'],
      ['employee@example.com', 'Employee Test', '0912345678', 'EMP-01', 'IT', 'EMPLOYEE'],
    ]);
    await expect(parseUserWorkbook(buffer)).resolves.toEqual([
      {
        rowNumber: 2,
        formulaFields: [],
        values: {
          email: 'employee@example.com',
          fullName: 'Employee Test',
          phone: '0912345678',
          employeeCode: 'EMP-01',
          departmentCode: 'IT',
          role: 'EMPLOYEE',
        },
      },
    ]);
  });

  it('rejects workbooks missing required headers', async () => {
    const buffer = await workbookBuffer([['email'], ['employee@example.com']]);
    await expect(parseUserWorkbook(buffer)).rejects.toMatchObject({
      code: 'INVALID_IMPORT_TEMPLATE',
    });
  });
});
