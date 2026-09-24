import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock('../src/modules/users/users.repository.js', () => ({ usersRepository: mocks }));
vi.mock('../src/modules/auth/auth.email.service.js', () => ({
  authEmailService: { sendInitializedAccountEmail: vi.fn() },
}));

import { usersService } from '../src/modules/users/users.service.js';

const userId = '00000000-0000-4000-8000-000000000010';

describe('usersService.getById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps a safe user detail response without credential fields', async () => {
    mocks.findById.mockResolvedValue({
      user_id: userId,
      email: 'analyst@example.com',
      full_name: 'Security Analyst',
      phone: '+84 900 000 000',
      employee_code: 'SEC-010',
      avatar_url: null,
      status: 'active',
      must_change_password: false,
      email_verified_at: new Date('2026-09-01T00:00:00.000Z'),
      last_login_at: new Date('2026-09-19T01:00:00.000Z'),
      disabled_at: null,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      updated_at: new Date('2026-09-19T01:00:00.000Z'),
      departments: { department_id: 'department-1', code: 'SEC', name: 'Security' },
      user_roles_user_roles_user_idTousers: [
        {
          assigned_at: new Date('2026-08-01T00:00:00.000Z'),
          roles: {
            role_id: 'role-1',
            code: 'SECURITY_OFFICER',
            name: 'Security Officer',
            description: 'Security operations role',
          },
        },
      ],
      password_hash: 'must-not-be-returned',
    });

    const result = await usersService.getById(userId);

    expect(mocks.findById).toHaveBeenCalledWith(userId);
    expect(result).toMatchObject({
      id: userId,
      fullName: 'Security Analyst',
      department: { id: 'department-1', code: 'SEC', name: 'Security' },
      roles: [{ id: 'role-1', code: 'SECURITY_OFFICER', name: 'Security Officer' }],
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns 404 for a deleted or missing user', async () => {
    mocks.findById.mockResolvedValue(null);

    await expect(usersService.getById(userId)).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});
