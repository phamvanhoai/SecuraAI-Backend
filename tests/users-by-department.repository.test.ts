import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  users: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  departments: { findMany: vi.fn() },
}));

vi.mock('../src/database/prisma.js', () => ({ prisma: prismaMock }));

import { usersRepository } from '../src/modules/user-management-authorization/users.repository.js';

const actorUserId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';
const departmentId = '773d8356-e68c-421b-9ce3-29ea4601970f';

describe('view users by department repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.users.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' });
  });

  it('filters the paginated database query by department id', async () => {
    prismaMock.users.findMany.mockResolvedValue([]);
    prismaMock.users.count.mockResolvedValue(0);
    prismaMock.users.groupBy.mockResolvedValue([]);

    await usersRepository.listUsers(actorUserId, {
      page: 1,
      limit: 20,
      departmentId,
    });

    expect(prismaMock.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { department_id: departmentId } }),
    );
    expect(prismaMock.users.count).toHaveBeenCalledWith({
      where: { department_id: departmentId },
    });
  });

  it('lists active departments without requiring an associated user', async () => {
    prismaMock.departments.findMany.mockResolvedValue([
      { id: departmentId, code: 'HR', name: 'Human Resources' },
    ]);

    const result = await usersRepository.listDepartments(actorUserId);

    expect(result).toMatchObject({
      kind: 'found',
      departments: [{ id: departmentId, code: 'HR', name: 'Human Resources' }],
    });
    expect(prismaMock.departments.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });
});
