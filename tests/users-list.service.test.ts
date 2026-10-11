import { user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/user-management-authorization/users.repository.js', () => ({
  usersRepository: {
    createUser: vi.fn(),
    deleteProvisionedUser: vi.fn(),
    findCurrentUser: vi.fn(),
    listUsers: vi.fn(),
  },
}));
vi.mock('../src/modules/user-management-authorization/users.email.service.js', () => ({
  usersEmailService: { sendAccountCreated: vi.fn() },
}));

import { usersRepository } from '../src/modules/user-management-authorization/users.repository.js';
import { usersService } from '../src/modules/user-management-authorization/users.service.js';

const actorUserId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';

describe('list V2 users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps V2 role and status into the frontend list contract', async () => {
    vi.mocked(usersRepository.listUsers).mockResolvedValue({
      kind: 'found',
      items: [
        {
          id: 'bc4fd619-9e78-45ea-8c67-f7f4fcb55df5',
          email: 'executive@example.com',
          username: 'executive-12345678',
          full_name: 'Executive User',
          employee_code: null,
          departments: null,
          role: user_role.EXECUTIVE,
          status: user_status.ACTIVE,
          created_at: new Date('2026-09-29T00:00:00.000Z'),
        },
      ],
      total: 1,
      statusCounts: [{ status: user_status.ACTIVE, _count: { _all: 1 } }],
    });

    const result = await usersService.listUsers(actorUserId, { page: 1, limit: 20 });
    expect(result.items[0]).toMatchObject({
      email: 'executive@example.com',
      employeeCode: null,
      department: null,
      roles: [{ code: 'EXECUTIVE', name: 'EXECUTIVE' }],
      status: 'ACTIVE',
    });
    expect(result.summary.active).toBe(1);
  });

  it('rejects non-admin access reported by the repository', async () => {
    vi.mocked(usersRepository.listUsers).mockResolvedValue({ kind: 'forbidden' });
    await expect(usersService.listUsers(actorUserId, { page: 1, limit: 20 })).rejects.toMatchObject(
      {
        statusCode: 403,
        code: 'ADMIN_REQUIRED',
      },
    );
  });
});
