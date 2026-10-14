import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/user-management-authorization/users.repository.js', () => ({
  usersRepository: { listDepartments: vi.fn() },
}));
vi.mock('../src/modules/user-management-authorization/user-import.parser.js', () => ({
  parseUserWorkbook: vi.fn(),
}));
vi.mock('../src/modules/user-management-authorization/users.email.service.js', () => ({
  usersEmailService: { sendAccountCreated: vi.fn() },
}));

import { parseUserWorkbook } from '../src/modules/user-management-authorization/user-import.parser.js';
import { usersRepository } from '../src/modules/user-management-authorization/users.repository.js';
import { usersService } from '../src/modules/user-management-authorization/users.service.js';

const actorUserId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';
const departmentId = '773d8356-e68c-421b-9ce3-29ea4601970f';

describe('import users from Excel', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('creates valid rows and reports invalid rows without aborting the file', async () => {
    vi.mocked(usersRepository.listDepartments).mockResolvedValue({
      kind: 'found',
      departments: [{ id: departmentId, code: 'IT', name: 'Information Technology' }],
    });
    vi.mocked(parseUserWorkbook).mockResolvedValue([
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
      {
        rowNumber: 3,
        formulaFields: [],
        values: {
          email: 'invalid',
          fullName: 'Invalid User',
          phone: '',
          employeeCode: '',
          departmentCode: '',
          role: 'EMPLOYEE',
        },
      },
    ]);
    const create = vi.spyOn(usersService, 'createUser').mockResolvedValue({
      id: 'user-id',
      email: 'employee@example.com',
      username: 'employee-1234',
      fullName: 'Employee Test',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      message: 'created',
    });

    const result = await usersService.importUsers(actorUserId, {
      originalName: 'users.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('xlsx'),
    });

    expect(create).toHaveBeenCalledWith(
      actorUserId,
      expect.objectContaining({
        email: 'employee@example.com',
        departmentId,
        role: 'EMPLOYEE',
      }),
    );
    expect(result).toMatchObject({ totalRows: 2, imported: 1, failed: 1 });
    expect(result.errors[0]).toMatchObject({ row: 3, code: 'VALIDATION_ERROR' });
  });
});
