import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createInitializedUser: vi.fn(),
  listCreateOptions: vi.fn(),
  sendInitializedAccountEmail: vi.fn(),
}));

vi.mock('../src/modules/users/users.repository.js', () => ({ usersRepository: mocks }));
vi.mock('../src/modules/auth/auth.email.service.js', () => ({ authEmailService: mocks }));

import { usersService } from '../src/modules/users/users.service.js';

const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['users.create', 'users.assign-role'],
  roles: ['ADMIN'],
};

describe('add user service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enforces users.create inside the service', async () => {
    await expect(
      usersService.listCreateOptions({ ...actor, permissions: [] }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    await expect(
      usersService.initializeAccount(
        { email: 'new@example.com', fullName: 'New User', roleCodes: ['EMPLOYEE'] },
        { ...actor, permissions: [] },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mocks.listCreateOptions).not.toHaveBeenCalled();
    expect(mocks.createInitializedUser).not.toHaveBeenCalled();
  });

  it('maps active department and role options', async () => {
    mocks.listCreateOptions.mockResolvedValue({
      departments: [{ department_id: 'department-1', code: 'SEC', name: 'Security' }],
      roles: [
        {
          role_id: 'role-1',
          code: 'EMPLOYEE',
          name: 'Employee',
          description: null,
          is_system: true,
        },
      ],
    });

    await expect(usersService.listCreateOptions(actor)).resolves.toEqual({
      departments: [{ id: 'department-1', code: 'SEC', name: 'Security' }],
      roles: [
        {
          id: 'role-1',
          code: 'EMPLOYEE',
          name: 'Employee',
          description: null,
          isSystem: true,
        },
      ],
    });
  });

  it('creates the account with the acting administrator and sends initialization email', async () => {
    mocks.createInitializedUser.mockResolvedValue({
      kind: 'created',
      user: { user_id: 'user-1', email: 'new@example.com', full_name: 'New User' },
    });
    mocks.sendInitializedAccountEmail.mockResolvedValue(undefined);

    const result = await usersService.initializeAccount(
      { email: 'new@example.com', fullName: 'New User', roleCodes: ['EMPLOYEE'] },
      actor,
    );

    expect(mocks.createInitializedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: actor.userId,
        passwordHash: expect.any(String),
      }),
    );
    expect(mocks.sendInitializedAccountEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        temporaryPassword: expect.stringMatching(/^\d{8}$/),
      }),
    );
    expect(result).toMatchObject({ id: 'user-1', email: 'new@example.com' });
  });
});
