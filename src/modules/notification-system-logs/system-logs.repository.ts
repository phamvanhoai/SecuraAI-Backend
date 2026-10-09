import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { SearchSystemLogsQuery } from './dto/search-system-logs.dto.js';
import type { ExportInvestigationLogsInput } from './dto/export-investigation-logs.dto.js';
import { createHash, randomUUID } from 'node:crypto';
import type { ConfigurationHistoryQuery } from './dto/configuration-history.dto.js';

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

function buildWhere(
  query: Omit<SearchSystemLogsQuery, 'page' | 'limit'>,
): Prisma.audit_logsWhereInput {
  const terms = query.q
    ?.split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 10);
  return {
    ...(query.eventType ? { action: { contains: query.eventType, mode: 'insensitive' } } : {}),
    ...(query.source ? { source: { contains: query.source, mode: 'insensitive' } } : {}),
    ...(query.status ? { outcome: query.status } : {}),
    ...(query.actor
      ? {
          OR: [
            { users: { full_name: { contains: query.actor, mode: 'insensitive' } } },
            { users: { email: { contains: query.actor, mode: 'insensitive' } } },
            { integration_api_keys: { name: { contains: query.actor, mode: 'insensitive' } } },
            ...(query.actor.toLowerCase().includes('system')
              ? [{ actor_type: 'SYSTEM' as const }]
              : []),
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          occurred_at: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(terms?.length ? { AND: terms.map(textSearch) } : {}),
  };
}

const exportSelect = {
  id: true,
  action: true,
  resource_type: true,
  resource_id: true,
  occurred_at: true,
  outcome: true,
  source: true,
  source_ip: true,
  correlation_id: true,
  error_code: true,
  duration_ms: true,
  actor_type: true,
  users: { select: { full_name: true, email: true } },
  integration_api_keys: { select: { name: true } },
} satisfies Prisma.audit_logsSelect;

export const systemLogsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { role: true, status: true, full_name: true, email: true },
    });
  },

  async search(query: SearchSystemLogsQuery) {
    const where = buildWhere(query);
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

  async configurationHistory(query: ConfigurationHistoryQuery) {
    const term = query.q?.trim();
    const terms = term?.split(/[\s·]+/u).filter(Boolean).slice(0, 5) ?? [];
    const where: Prisma.audit_logsWhereInput = {
      AND: [
        { OR: [{ action: { contains: 'CONFIG', mode: 'insensitive' } }, { resource_type: { contains: 'CONFIG', mode: 'insensitive' } }] },
        ...terms.map((value) => {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
          return { OR: [{ action: { contains: value, mode: 'insensitive' as const } }, { resource_type: { contains: value, mode: 'insensitive' as const } }, ...(isUuid ? [{ resource_id: { equals: value } }] : [])] };
        }),
        ...(query.actor ? [{ OR: [{ users: { full_name: { contains: query.actor, mode: 'insensitive' as const } } }, { users: { email: { contains: query.actor, mode: 'insensitive' as const } } }] }] : []),
        ...(query.from || query.to ? [{ occurred_at: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }] : []),
      ],
    };
    const [items, total] = await prisma.$transaction([
      prisma.audit_logs.findMany({ where, orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit, select: { id: true, action: true, resource_type: true, resource_id: true, occurred_at: true, before_data: true, after_data: true, outcome: true, users: { select: { full_name: true, email: true, role: true } } } }),
      prisma.audit_logs.count({ where }),
    ]);
    const userIds = items.filter((item) => item.resource_id && /USER|PERMISSION/i.test(`${item.action} ${item.resource_type}`)).map((item) => item.resource_id as string);
    const users = userIds.length ? await prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, full_name: true, email: true, role: true } }) : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    return { items: items.map((item) => ({ ...item, resourceDetails: item.resource_id ? userById.get(item.resource_id) ?? null : null })), total };
  },

  findForExport(input: ExportInvestigationLogsInput) {
    const filtered = buildWhere(input.filters);
    const where: Prisma.audit_logsWhereInput =
      input.scope === 'SELECTED'
        ? { AND: [filtered, { id: { in: input.selectedIds } }] }
        : filtered;
    return prisma.audit_logs.findMany({
      where,
      select: exportSelect,
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      take: 10_001,
    });
  },

  async recordExport(
    exportId: string,
    actorUserId: string,
    input: ExportInvestigationLogsInput,
    recordCount: number,
    generatedAt: Date,
    contentSha256: string,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.report_exports.create({
        data: {
          id: exportId,
          report_type: 'INVESTIGATION_LOGS',
          requested_by: actorUserId,
          filters: {
            request: input,
            integrity: { algorithm: 'SHA-256', value: contentSha256 },
            schemaVersion: '1.0',
          },
          status: 'COMPLETED',
          file_format: input.format,
          record_count: recordCount,
          created_at: generatedAt,
          generated_at: generatedAt,
          completed_at: generatedAt,
        },
      });
      const auditId = randomUUID();
      const after = {
        exportId,
        format: input.format,
        scope: input.scope,
        recordCount,
        reason: input.reason,
        contentSha256,
      };
      await tx.audit_logs.create({
        data: {
          id: auditId,
          actor_type: 'USER',
          actor_user_id: actorUserId,
          action: 'INVESTIGATION_LOGS_EXPORTED',
          resource_type: 'REPORT_EXPORT',
          resource_id: exportId,
          source: 'API',
          after_data: after,
          record_hash: createHash('sha256')
            .update(
              JSON.stringify({ id: auditId, actorUserId, after, at: generatedAt.toISOString() }),
            )
            .digest('hex'),
        },
      });
    });
  },
};
