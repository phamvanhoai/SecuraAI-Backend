import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/user-management-authorization/users.repository.js', () => ({
  usersRepository: {
    createUser: vi.fn(),
    deleteProvisionedUser: vi.fn(),
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
  beforeEach(() => vi.clearAllMocks());

  it('creates the account and emails a strong temporary password', async () => {
    vi.mocked(usersRepository.createUser).mockResolvedValue({
      kind: 'created',
      user: {
        id: userId,
        email: input.email,
        username: 'new-12345678',
        full_name: input.fullName,
        role: user_role.EXECUTIVE,
        status: user_status.ACTIVE,
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
        status: user_status.ACTIVE,
      },
    });
    vi.mocked(usersEmailService.sendAccountCreated).mockRejectedValue(new Error('SMTP down'));
    await expect(usersService.createUser(actorUserId, input)).rejects.toMatchObject({
      statusCode: 503,
      code: 'EMAIL_DELIVERY_FAILED',
    });
    expect(usersRepository.deleteProvisionedUser).toHaveBeenCalledWith(userId);
  });
});


