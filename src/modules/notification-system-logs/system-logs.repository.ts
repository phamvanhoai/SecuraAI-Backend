import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { SearchSystemLogsQuery } from './dto/search-system-logs.dto.js';

const textSearch = (term: string): Prisma.audit_logsWhereInput => ({
  OR: [
    { action: { contains: term, mode: 'insensitive' } },
    { resource_type: { contains: term, mode: 'insensitive' } },
    { source: { contains: term, mode: 'insensitive' } },
    { correlation_id: { contains: term, mode: 'insensitive' } },
    { error_code: { contains: term, mode: 'insensitive' } },
    { users: { full_name: { contains: term, mode: 'insensitive' } } },
    { users: { email: { contains: term, mode: 'insensitive' } } },
    { integration_api_keys: { name: { contains: term, mode: 'insensitive' } } },
  ],
});

export const systemLogsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  },

  async search(query: SearchSystemLogsQuery) {
    const terms = query.q?.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 10);
    const where: Prisma.audit_logsWhereInput = {
      ...(query.eventType ? { action: { contains: query.eventType, mode: 'insensitive' } } : {}),
      ...(query.source ? { source: { contains: query.source, mode: 'insensitive' } } : {}),
      ...(query.status ? { outcome: query.status } : {}),
      ...(query.actor
        ? {
            OR: [
              { users: { full_name: { contains: query.actor, mode: 'insensitive' } } },
              { users: { email: { contains: query.actor, mode: 'insensitive' } } },
              { integration_api_keys: { name: { contains: query.actor, mode: 'insensitive' } } },
              ...(query.actor.toLowerCase().includes('system') ? [{ actor_type: 'SYSTEM' as const }] : []),
            ],
          }
        : {}),
      ...(query.from || query.to
        ? { occurred_at: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
      ...(terms?.length ? { AND: terms.map(textSearch) } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.audit_logs.findMany({
        where,
        select: {
          id: true,
          action: true,
          resource_type: true,
          occurred_at: true,
          outcome: true,
          source: true,
          correlation_id: true,
          error_code: true,
          actor_type: true,
          users: { select: { full_name: true, email: true } },
          integration_api_keys: { select: { name: true } },
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
