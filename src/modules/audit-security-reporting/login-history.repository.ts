import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListLoginHistoryQuery } from './dto/list-login-history.dto.js';

function buildWhere(query: ListLoginHistoryQuery): Prisma.authentication_historyWhereInput {
  return {
    ...(query.status ? { status: query.status === 'success' ? 'SUCCESS' : 'FAILED' } : {}),
    ...(query.userId ? { user_id: query.userId } : {}),
    ...(query.ipAddress ? { ip_address: query.ipAddress } : {}),
    ...(query.from || query.to
      ? {
          occurred_at: {
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
  record(input: { userId?: string; email: string; status: 'SUCCESS' | 'FAILED'; failureReason?: string; ipAddress?: string; userAgent?: string }) {
    return prisma.authentication_history.create({
      data: { email_attempted: input.email, status: input.status, ...(input.userId ? { user_id: input.userId } : {}), ...(input.failureReason ? { failure_reason: input.failureReason } : {}), ...(input.ipAddress ? { ip_address: input.ipAddress } : {}), ...(input.userAgent ? { user_agent: input.userAgent } : {}) },
      select: { id: true },
    });
  },

  findViewer(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  async list(query: ListLoginHistoryQuery) {
    const where = buildWhere(query);
    const [items, total] = await prisma.$transaction([
      prisma.authentication_history.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ occurred_at: query.sortOrder }, { id: query.sortOrder }],
        select: {
          id: true,
          user_id: true,
          occurred_at: true,
          status: true,
          email_attempted: true,
          failure_reason: true,
          ip_address: true,
          user_agent: true,
          users: { select: { full_name: true, email: true } },
        },
      }),
      prisma.authentication_history.count({ where }),
    ]);
    return { items, total };
  },
} as const;
