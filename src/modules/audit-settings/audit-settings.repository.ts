import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListLoginHistoryQuery } from './dto/index.js';

export const auditSettingsRepository = {
  async listLoginHistory(query: ListLoginHistoryQuery) {
    const where: Prisma.login_historyWhereInput = {
      ...(query.userId ? { user_id: query.userId } : {}),
      ...(query.ipAddress ? { ip_address: query.ipAddress } : {}),
      ...(query.status ? { success: query.status === 'success' } : {}),
      ...(query.from || query.to
        ? {
            logged_in_at: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { email_attempted: { contains: query.search, mode: 'insensitive' } },
              { users: { is: { full_name: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction(
      [
        prisma.login_history.findMany({
          where,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: [{ logged_in_at: query.sortOrder }, { login_history_id: query.sortOrder }],
          select: {
            login_history_id: true,
            user_id: true,
            email_attempted: true,
            ip_address: true,
            user_agent: true,
            success: true,
            failure_reason: true,
            logged_in_at: true,
            users: { select: { full_name: true } },
          },
        }),
        prisma.login_history.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total };
  },
} as const;
