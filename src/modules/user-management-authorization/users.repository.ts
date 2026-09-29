import { prisma } from '../../database/prisma.js';
import type { CreateUserBody } from './dto/create-user.dto.js';
import type { ListUsersQuery } from './dto/list-users-query.dto.js';

export const usersRepository = {
  listUsers(actorUserId: string, query: ListUsersQuery) {
    return prisma.$transaction(async (transaction) => {
      const actor = await transaction.users.findUnique({
        where: { id: actorUserId },
        select: { role: true, status: true },
      });
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
      };
      const [items, total, statusCounts] = await Promise.all([
        transaction.users.findMany({
          where,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            email: true,
            username: true,
            full_name: true,
            role: true,
            status: true,
            created_at: true,
          },
        }),
        transaction.users.count({ where }),
        transaction.users.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);
      return { kind: 'found', items, total, statusCounts } as const;
    });
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

      const user = await transaction.users.create({
        data: {
          email: input.email,
          username: input.username,
          password_hash: input.passwordHash,
          full_name: input.fullName,
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
