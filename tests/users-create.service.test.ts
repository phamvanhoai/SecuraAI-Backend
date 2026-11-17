import ExcelJS from 'exceljs';
import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/user-management-authorization/users.repository.js', () => ({
  usersRepository: {
    createUser: vi.fn(),
    deleteProvisionedUser: vi.fn(),
    activateProvisionedUser: vi.fn(),
    listDepartments: vi.fn(),
    findCurrentUser: vi.fn(),
  },
}));
vi.mock('../src/modules/user-management-authorization/users.email.service.js', () => ({
  usersEmailService: { sendAccountCreated: vi.fn() },
}));

import { usersEmailService } from '../src/modules/user-management-authorization/users.email.service.js';
import { usersRepository } from '../src/modules/user-management-authorization/users.repository.js';
import { usersService } from '../src/modules/user-management-authorization/users.service.js';

const actorUserId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';
const userId = 'bc4fd619-9e78-45ea-8c67-f7f4fcb55df5';
const input = { email: 'new@example.com', fullName: 'New User', role: user_role.EXECUTIVE };

describe('create V2 user', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(usersRepository.activateProvisionedUser).mockResolvedValue({
      id: userId,
      email: input.email,
      username: 'new-12345678',
      full_name: input.fullName,
      role: user_role.EXECUTIVE,
      status: user_status.ACTIVE,
    });
    vi.mocked(usersRepository.deleteProvisionedUser).mockResolvedValue(true);
  });

  it('creates the account and emails a strong temporary password', async () => {
    vi.mocked(usersRepository.createUser).mockResolvedValue({
      kind: 'created',
      user: {
        id: userId,
        email: input.email,
        username: 'new-12345678',
        full_name: input.fullName,
        role: user_role.EXECUTIVE,
        status: user_status.INACTIVE,
      },
    });

    const result = await usersService.createUser(actorUserId, input);

    expect(usersRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        ...input,
        actorUserId,
        passwordHash: expect.stringMatching(/^\$argon2id\$/),
      }),
    );
    expect(usersEmailService.sendAccountCreated).toHaveBeenCalledWith({
      email: input.email,
      fullName: input.fullName,
      temporaryPassword: expect.stringMatching(/[A-Z]!$/),
    });
    expect(result).toMatchObject({ id: userId, role: 'EXECUTIVE', status: 'ACTIVE' });
    expect(
      vi.mocked(usersEmailService.sendAccountCreated).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(usersRepository.activateProvisionedUser).mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(usersRepository.deleteProvisionedUser).not.toHaveBeenCalled();
  });

  it('rejects a non-admin actor before an email is sent', async () => {
    vi.mocked(usersRepository.createUser).mockResolvedValue({ kind: 'forbidden' });
    await expect(usersService.createUser(actorUserId, input)).rejects.toMatchObject({
      statusCode: 403,
      code: 'ADMIN_REQUIRED',
    });
    expect(usersEmailService.sendAccountCreated).not.toHaveBeenCalled();
  });

  it('removes the new account when email delivery fails', async () => {
    vi.mocked(usersRepository.createUser).mockResolvedValue({
      kind: 'created',
      user: {
        id: userId,
        email: input.email,
        username: 'new-12345678',
        full_name: input.fullName,
        role: user_role.EXECUTIVE,
        status: user_status.INACTIVE,
      },
    });
    vi.mocked(usersEmailService.sendAccountCreated).mockRejectedValue(new Error('SMTP down'));
    await expect(usersService.createUser(actorUserId, input)).rejects.toMatchObject({
      statusCode: 503,
      code: 'EMAIL_DELIVERY_FAILED',
    });
    expect(usersRepository.deleteProvisionedUser).toHaveBeenCalledWith(
      userId,
      expect.stringMatching(/^\$argon2id\$/),
      actorUserId,
      'EMAIL_DELIVERY_FAILED',
    );
    expect(usersRepository.activateProvisionedUser).not.toHaveBeenCalled();
  });
});

describe('provisioning failure handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(usersRepository.createUser).mockResolvedValue({
      kind: 'created',
      user: {
        id: userId,
        email: input.email,
        username: 'new-user',
        full_name: input.fullName,
        role: 'EXECUTIVE',
        status: 'INACTIVE',
      },
    });
    vi.mocked(usersRepository.deleteProvisionedUser).mockResolvedValue(true);
  });
  it('cleans up an inactive account if activation cannot complete after sending', async () => {
    vi.mocked(usersRepository.activateProvisionedUser).mockResolvedValue(null);
    await expect(usersService.createUser(actorUserId, input)).rejects.toMatchObject({
      code: 'USER_ACTIVATION_FAILED',
      statusCode: 503,
    });
    expect(usersRepository.deleteProvisionedUser).toHaveBeenCalledWith(
      userId,
      expect.any(String),
      actorUserId,
      'USER_ACTIVATION_FAILED',
    );
  });
  it('reports cleanup failure explicitly instead of claiming no account exists', async () => {
    vi.mocked(usersEmailService.sendAccountCreated).mockRejectedValue(new Error('SMTP failure'));
    vi.mocked(usersRepository.deleteProvisionedUser).mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(usersService.createUser(actorUserId, input)).rejects.toMatchObject({
      code: 'USER_PROVISIONING_CLEANUP_FAILED',
      statusCode: 503,
    });
    expect(usersRepository.activateProvisionedUser).not.toHaveBeenCalled();
  });
  it('does not hide a concurrent provisioning state change', async () => {
    vi.mocked(usersEmailService.sendAccountCreated).mockRejectedValue(new Error('SMTP failure'));
    vi.mocked(usersRepository.deleteProvisionedUser).mockResolvedValue(false);
    await expect(usersService.createUser(actorUserId, input)).rejects.toMatchObject({
      code: 'USER_PROVISIONING_CLEANUP_FAILED',
    });
  });
  it('does not send email after a duplicate account creation error', async () => {
    const { Prisma } = await import('@prisma/client');
    vi.mocked(usersRepository.createUser).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.12.0',
      }),
    );
    await expect(usersService.createUser(actorUserId, input)).rejects.toMatchObject({
      code: 'USER_ALREADY_EXISTS',
      statusCode: 409,
    });
    expect(usersEmailService.sendAccountCreated).not.toHaveBeenCalled();
    expect(usersRepository.deleteProvisionedUser).not.toHaveBeenCalled();
  });
});

it('returns an import row failure rather than success when account email fails', async () => {
  vi.resetAllMocks();
  vi.mocked(usersRepository.listDepartments).mockResolvedValue({ kind: 'found', departments: [] });
  vi.mocked(usersRepository.createUser).mockResolvedValue({
    kind: 'created',
    user: {
      id: userId,
      email: input.email,
      username: 'new-user',
      full_name: input.fullName,
      role: 'EXECUTIVE',
      status: 'INACTIVE',
    },
  });
  vi.mocked(usersEmailService.sendAccountCreated).mockRejectedValue(new Error('SMTP down'));
  vi.mocked(usersRepository.deleteProvisionedUser).mockResolvedValue(true);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Users');
  sheet.addRow(['email', 'fullName', 'role']);
  sheet.addRow([input.email, input.fullName, 'EXECUTIVE']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const result = await usersService.importUsers(actorUserId, {
    originalName: 'users.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  expect(result).toMatchObject({
    imported: 0,
    failed: 1,
    errors: [{ row: 2, code: 'EMAIL_DELIVERY_FAILED' }],
  });
  expect(usersRepository.activateProvisionedUser).not.toHaveBeenCalled();
  expect(usersRepository.deleteProvisionedUser).toHaveBeenCalled();
});

it('reports activation database failure distinctly from email delivery failure', async () => {
  vi.resetAllMocks();
  vi.mocked(usersRepository.createUser).mockResolvedValue({
    kind: 'created',
    user: {
      id: userId,
      email: input.email,
      username: 'new-user',
      full_name: input.fullName,
      role: 'EXECUTIVE',
      status: 'INACTIVE',
    },
  });
  vi.mocked(usersEmailService.sendAccountCreated).mockResolvedValue();
  vi.mocked(usersRepository.activateProvisionedUser).mockRejectedValue(
    new Error('activation database error'),
  );
  vi.mocked(usersRepository.deleteProvisionedUser).mockResolvedValue(true);
  await expect(usersService.createUser(actorUserId, input)).rejects.toMatchObject({
    code: 'USER_ACTIVATION_FAILED',
  });
});
