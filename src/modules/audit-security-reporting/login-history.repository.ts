import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListLoginHistoryQuery } from './dto/list-login-history.dto.js';

function buildWhere(query: ListLoginHistoryQuery): Prisma.auth_sessionsWhereInput {
  return {
    ...(query.status === 'failed' ? { id: { equals: '00000000-0000-0000-0000-000000000000' } } : {}),
    ...(query.userId ? { user_id: query.userId } : {}),
    ...(query.from || query.to
      ? {
          created_at: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          users: {
            OR: [
              { full_name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };
}

export const loginHistoryRepository = {
  findViewer(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  async list(query: ListLoginHistoryQuery) {
    if (query.ipAddress) return { items: [], total: 0 };
    const where = buildWhere(query);
    const [items, total] = await prisma.$transaction([
      prisma.auth_sessions.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ created_at: query.sortOrder }, { id: query.sortOrder }],
        select: {
          id: true,
          user_id: true,
          created_at: true,
          users: { select: { full_name: true, email: true } },
        },
      }),
      prisma.auth_sessions.count({ where }),
    ]);
    return { items, total };
  },
} as const;
