import { Prisma } from '@prisma/client';
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
  record(input: {
    userId?: string;
    email: string;
    status: 'SUCCESS' | 'FAILED';
    failureReason?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.authentication_history.create({
      data: {
        email_attempted: input.email,
        status: input.status,
        ...(input.userId ? { user_id: input.userId } : {}),
        ...(input.failureReason ? { failure_reason: input.failureReason } : {}),
        ...(input.ipAddress ? { ip_address: input.ipAddress } : {}),
        ...(input.userAgent ? { user_agent: input.userAgent } : {}),
      },
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
    const filters: Prisma.Sql[] = [Prisma.sql`true`];
    if (query.status)
      filters.push(Prisma.sql`h.status = ${query.status === 'success' ? 'SUCCESS' : 'FAILED'}`);
    if (query.userId) filters.push(Prisma.sql`h.user_id = ${query.userId}::uuid`);
    if (query.ipAddress) filters.push(Prisma.sql`h.ip_address = ${query.ipAddress}`);
    if (query.from) filters.push(Prisma.sql`h.occurred_at >= ${new Date(query.from)}`);
    if (query.to) filters.push(Prisma.sql`h.occurred_at <= ${new Date(query.to)}`);
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM users u WHERE u.id = h.user_id AND (u.full_name ILIKE ${pattern} OR u.email ILIKE ${pattern}))`,
      );
    }
    const [items, totals] = await prisma.$transaction(
      [
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
        prisma.$queryRaw<
          Array<{ total: number; successful: number; failed: number; accounts: number }>
        >`
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE h.status = 'SUCCESS')::int AS successful,
          count(*) FILTER (WHERE h.status = 'FAILED')::int AS failed,
          count(DISTINCT h.user_id)::int AS accounts
        FROM authentication_history h WHERE ${Prisma.join(filters, ' AND ')}`,
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const summary = totals[0] ?? { total: 0, successful: 0, failed: 0, accounts: 0 };
    return {
      items,
      total: summary.total,
      summary: {
        successful: summary.successful,
        failed: summary.failed,
        accounts: summary.accounts,
      },
    };
  },
} as const;
