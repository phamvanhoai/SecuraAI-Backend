import { prisma } from '../../database/prisma.js';
import type { CreateUserBody } from './dto/create-user.dto.js';
import type { ListUsersQuery } from './dto/list-users-query.dto.js';
import type { UpdateUserBody } from './dto/update-user.dto.js';

const userDetailSelect = {
  id: true,
  email: true,
  username: true,
  full_name: true,
  phone: true,
  employee_code: true,
  department_id: true,
  departments: { select: { id: true, code: true, name: true } },
  role: true,
  status: true,
  google_subject: true,
  last_login_at: true,
  password_changed_at: true,
  created_at: true,
  updated_at: true,
} as const;

function findActor(actorUserId: string) {
  return prisma.users.findUnique({
    where: { id: actorUserId },
    select: { role: true, status: true },
  });
}

export const usersRepository = {
  async listDepartments(actorUserId: string) {
    const actor = await findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
    if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;
    const departments = await prisma.departments.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return { kind: 'found', departments } as const;
  },
  async getUserById(actorUserId: string, userId: string) {
    const actor = await findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
    if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: userDetailSelect,
    });
    if (!user) return { kind: 'not_found' } as const;
    return { kind: 'found', user } as const;
  },
  updateUser(actorUserId: string, userId: string, input: UpdateUserBody) {
    return prisma.$transaction(async (transaction) => {
      const actor = await transaction.users.findUnique({
        where: { id: actorUserId },
        select: { id: true, role: true, status: true },
      });
      if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
      if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;

      const existing = await transaction.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          full_name: true,
          phone: true,
          employee_code: true,
          department_id: true,
          status: true,
        },
      });
      if (!existing) return { kind: 'not_found' } as const;
      if (input.departmentId) {
        const department = await transaction.departments.findFirst({
          where: { id: input.departmentId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!department) return { kind: 'invalid_department' } as const;
      }

      const user = await transaction.users.update({
        where: { id: userId },
        data: {
          full_name: input.fullName,
          phone: input.phone,
          employee_code: input.employeeCode,
          department_id: input.departmentId,
          status: input.status,
        },
        select: userDetailSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: actor.id,
          actor_type: 'USER',
          action: 'USER_UPDATED',
          resource_type: 'USER',
          resource_id: user.id,
          source: 'API',
          before_data: {
            fullName: existing.full_name,
            phone: existing.phone,
            employeeCode: existing.employee_code,
            departmentId: existing.department_id,
            status: existing.status,
          },
          after_data: {
            fullName: user.full_name,
            phone: user.phone,
            employeeCode: user.employee_code,
            departmentId: user.department_id,
            status: user.status,
          },
          record_hash: `USER_UPDATED:${user.id}:${actor.id}:${user.updated_at.toISOString()}`,
        },
      });
      return { kind: 'updated', user } as const;
    });
  },
  async listUsers(actorUserId: string, query: ListUsersQuery) {
    const actor = await findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
    if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;

    const where = {
      ...(query.q
        ? {
            OR: [
              { full_name: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { username: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.roleCode ? { role: query.roleCode } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { department_id: query.departmentId } : {}),
    };
    const [items, total, statusCounts] = await Promise.all([
      prisma.users.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          email: true,
          username: true,
          full_name: true,
          employee_code: true,
          departments: { select: { id: true, code: true, name: true } },
          role: true,
          status: true,
          created_at: true,
        },
      }),
      prisma.users.count({ where }),
      prisma.users.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return { kind: 'found', items, total, statusCounts } as const;
  },
  findCurrentUser(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        status: true,
      },
    });
  },
  createUser(
    input: CreateUserBody & { actorUserId: string; username: string; passwordHash: string },
  ) {
    return prisma.$transaction(async (transaction) => {
      const actor = await transaction.users.findUnique({
        where: { id: input.actorUserId },
        select: { id: true, role: true, status: true },
      });
      if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
      if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;
      if (input.departmentId) {
        const department = await transaction.departments.findFirst({
          where: { id: input.departmentId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!department) return { kind: 'invalid_department' } as const;
      }

      const user = await transaction.users.create({
        data: {
          email: input.email,
          username: input.username,
          password_hash: input.passwordHash,
          full_name: input.fullName,
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.employeeCode !== undefined ? { employee_code: input.employeeCode } : {}),
          ...(input.departmentId !== undefined
            ? { departments: { connect: { id: input.departmentId } } }
            : {}),
          role: input.role,
        },
        select: {
          id: true,
          email: true,
          username: true,
          full_name: true,
          role: true,
          status: true,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: actor.id,
          actor_type: 'USER',
          action: 'USER_CREATED',
          resource_type: 'USER',
          resource_id: user.id,
          source: 'API',
          after_data: {
            email: user.email,
            username: user.username,
            role: user.role,
            status: user.status,
          },
          record_hash: `USER_CREATED:${user.id}:${actor.id}`,
        },
      });
      return { kind: 'created', user } as const;
    });
  },
  deleteProvisionedUser(userId: string) {
    return prisma.$transaction([
      prisma.audit_logs.deleteMany({
        where: { resource_type: 'USER', resource_id: userId, action: 'USER_CREATED' },
      }),
      prisma.users.delete({ where: { id: userId } }),
    ]);
  },
};
