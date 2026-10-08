import { AppError } from '../../common/errors/app-error.js';
import type { SearchSystemLogsQuery } from './dto/search-system-logs.dto.js';
import { systemLogsRepository } from './system-logs.repository.js';
import type { ExportInvestigationLogsInput } from './dto/export-investigation-logs.dto.js';
import { createHash, randomUUID } from 'node:crypto';
import { renderInvestigationLogPdf } from './investigation-log-pdf.js';
import { renderInvestigationLogXlsx } from './investigation-log-xlsx.js';

function actorName(record: Awaited<ReturnType<typeof systemLogsRepository.findForExport>>[number]) {
  return (
    record.users?.full_name ??
    record.users?.email ??
    record.integration_api_keys?.name ??
    (record.actor_type === 'SYSTEM' ? 'System' : 'Unknown actor')
  );
}
function csvCell(value: string | null) {
  const safe = value && /^[=+\-@]/.test(value) ? `'${value}` : (value ?? '');
  return `"${safe.replaceAll('"', '""')}"`;
}

export const systemLogsService = {
  async search(actorUserId: string, query: SearchSystemLogsQuery) {
    const actor = await systemLogsRepository.findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Administrator or Security Officer access required');

    const result = await systemLogsRepository.search(query);
    return {
      items: result.items.map((record) => ({
        id: record.id,
        occurredAt: record.occurred_at.toISOString(),
        eventType: record.action,
        source: record.source ?? 'Application',
        actor:
          record.users?.full_name ??
          record.users?.email ??
          record.integration_api_keys?.name ??
          (record.actor_type === 'SYSTEM' ? 'System' : 'Unknown actor'),
        actorDetail: record.users?.email ?? null,
        status: record.outcome,
        resourceType: record.resource_type,
        correlationId: record.correlation_id,
        errorCode: record.error_code,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pageCount: Math.max(1, Math.ceil(result.total / query.limit)),
      },
    };
  },
  async export(actorUserId: string, input: ExportInvestigationLogsInput) {
    const actor = await systemLogsRepository.findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Administrator or Security Officer access required');
    const records = await systemLogsRepository.findForExport(input);
    if (records.length > 10_000)
      throw new AppError(422, 'EXPORT_TOO_LARGE', 'Narrow the filters to 10,000 logs or fewer');
    if (input.scope === 'SELECTED' && records.length !== input.selectedIds.length)
      throw new AppError(
        409,
        'LOG_SELECTION_CHANGED',
        'One or more selected logs are no longer available',
      );
    const rows = records.map((record) => ({
      id: record.id,
      occurredAt: record.occurred_at.toISOString(),
      eventType: record.action,
      source: record.source ?? 'Application',
      actor: actorName(record),
      actorEmail: record.users?.email ?? null,
      actorType: record.actor_type,
      status: record.outcome,
      resourceType: record.resource_type,
      resourceId: record.resource_id,
      sourceIp: record.source_ip,
      correlationId: record.correlation_id,
      errorCode: record.error_code,
      durationMs: record.duration_ms,
    }));
    const exportId = randomUUID();
    const generatedAt = new Date();
    const recordSetSha256 = createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
    const metadata = {
      schemaVersion: '1.0',
      exportId,
      title: 'SecuraAI Investigation Log Export',
      generatedAt: generatedAt.toISOString(),
      displayTimeZone: 'Asia/Ho_Chi_Minh',
      exportedBy: {
        id: actorUserId,
        name: actor.full_name,
        email: actor.email,
        role: actor.role,
      },
      purpose: input.reason,
      scope: input.scope,
      format: input.format,
      recordCount: rows.length,
      sourceSystem: 'SecuraAI',
      sourceDataset: 'audit_logs',
      recordSetSha256,
    };
    const csvHeaders = [
      'Schema Version',
      'Export ID',
      'Generated At UTC',
      'Display Time Zone',
      'Exported By',
      'Exporter Email',
      'Exporter Role',
      'Purpose',
      'Scope',
      'Applied Filters',
      'Record Count',
      'Record-set SHA-256',
      'Occurred At UTC',
      'Event Type',
      'Source',
      'Actor',
      'Actor Email',
      'Status',
      'Resource Type',
      'Correlation ID',
      'Error Code',
    ];
    const content =
      input.format === 'PDF'
        ? await renderInvestigationLogPdf(metadata, input.filters, rows)
        : input.format === 'XLSX'
          ? await renderInvestigationLogXlsx(metadata, input.filters, rows)
        : input.format === 'JSON'
          ? JSON.stringify(
              {
                metadata,
                filters: input.filters,
                records: rows,
              },
              null,
              2,
            )
          : `\uFEFF${csvHeaders.map(csvCell).join(',')}\r\n${rows.map((row) => [metadata.schemaVersion, exportId, metadata.generatedAt, metadata.displayTimeZone, actor.full_name, actor.email, actor.role, input.reason, input.scope, JSON.stringify(input.filters), String(rows.length), recordSetSha256, row.occurredAt, row.eventType, row.source, row.actor, row.actorEmail, row.status, row.resourceType, row.correlationId, row.errorCode].map(csvCell).join(',')).join('\r\n')}`;
    const digest = createHash('sha256').update(content).digest();
    const contentSha256 = digest.toString('hex');
    await systemLogsRepository.recordExport(
      exportId,
      actorUserId,
      input,
      rows.length,
      generatedAt,
      contentSha256,
    );
    return {
      content,
      exportId,
      recordCount: rows.length,
      contentSha256,
      contentDigest: `sha-256=:${digest.toString('base64')}:`,
      contentType:
        input.format === 'PDF'
          ? 'application/pdf'
          : input.format === 'CSV'
            ? 'text/csv; charset=utf-8; header=present'
            : input.format === 'XLSX'
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'application/json; charset=utf-8',
      extension: input.format.toLowerCase(),
    };
  },
};
