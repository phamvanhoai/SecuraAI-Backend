import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { SearchSystemLogsQuery } from './dto/search-system-logs.dto.js';
import type { ExportInvestigationLogsInput } from './dto/export-investigation-logs.dto.js';
import { createHash, randomUUID } from 'node:crypto';

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
