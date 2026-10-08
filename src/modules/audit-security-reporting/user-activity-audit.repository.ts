import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListUserActivityAuditQuery } from './dto/list-user-activity-audit.dto.js';

export const userActivityAuditRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
  },

  async list(query: ListUserActivityAuditQuery) {
    const searchTerms = query.q
      ?.split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .slice(0, 10);
    const where: Prisma.audit_logsWhereInput = {
      actor_type: 'USER',
      actor_user_id: { not: null },
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.resourceType ? { resource_type: query.resourceType } : {}),
      ...(searchTerms?.length
        ? {
            AND: searchTerms.map((term) => ({
              OR: [
                { action: { contains: term, mode: 'insensitive' as const } },
                { resource_type: { contains: term, mode: 'insensitive' as const } },
                { users: { full_name: { contains: term, mode: 'insensitive' as const } } },
                { users: { email: { contains: term, mode: 'insensitive' as const } } },
              ],
            })),
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.audit_logs.findMany({
        where,
        select: {
          id: true,
          action: true,
          resource_type: true,
          resource_id: true,
          occurred_at: true,
          outcome: true,
          source: true,
          source_ip: true,
          error_code: true,
          users: { select: { id: true, full_name: true, email: true } },
        },
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.audit_logs.count({ where }),
    ]);
    return { items, total };
  },
};
