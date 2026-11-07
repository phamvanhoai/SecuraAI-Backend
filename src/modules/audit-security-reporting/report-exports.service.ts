import type { Prisma, report_export_status } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { reportExportsRepository } from './report-exports.repository.js';
import type { ReportExportAuditContext } from './report-exports.repository.js';
import { renderSecurityReportXlsx } from './security-report-xlsx.js';
import { renderSecurityReportCsv } from './security-report-csv.js';
import { renderSecurityReportPdf } from './security-report-pdf.js';
import type {
  ExportReportRequest,
  ListExportReportsQuery,
  ReportExportItem,
  ReportFormat,
  ReportType,
} from './dto/export-security-reports.dto.js';

function mapReportExportItem(
  item: {
    id: string;
    report_type: string;
    status: report_export_status;
    storage_uri: string | null;
    filters: Prisma.JsonValue;
    generated_at: Date | null;
    created_at: Date;
    users: { id: string; full_name: string; role: string };
  },
  overrideSummary?: { recordCount: number; period?: string; highlights?: string[] },
): ReportExportItem {
  const filters = (item.filters as Record<string, unknown> | null) || null;
  const format = (filters?.format as ReportFormat) || 'EXCEL';
  const recordCount =
    overrideSummary?.recordCount ??
    (typeof filters?.recordCount === 'number' ? filters.recordCount : 0);
  const isRevoked = filters?.isRevoked === true;
  const revokedAt = typeof filters?.revokedAt === 'string' ? filters.revokedAt : null;
  const revokedBy = typeof filters?.revokedBy === 'string' ? filters.revokedBy : null;
  const revocationReason = typeof filters?.revocationReason === 'string' ? filters.revocationReason : null;

  const startStr = typeof filters?.startDate === 'string' ? filters.startDate : 'All';
  const endStr = typeof filters?.endDate === 'string' ? filters.endDate : 'Now';
  const defaultPeriod =
    filters?.startDate || filters?.endDate
      ? `${startStr} to ${endStr}`
      : 'All available records';

  return {
    id: item.id,
    reportType: item.report_type,
    format,
    status: item.status,
    storageUri: item.storage_uri,
    requestedBy: {
      id: item.users.id,
      fullName: item.users.full_name,
      role: item.users.role,
    },
    filters,
    summary: {
      recordCount,
      period: overrideSummary?.period ?? defaultPeriod,
      highlights: overrideSummary?.highlights,
    },
    downloadUrl: `/api/v1/reports/exports/${item.id}/download`,
    isRevoked,
    revokedAt,
    revokedBy,
    revocationReason,
    generatedAt: item.generated_at ? item.generated_at.toISOString() : null,
    createdAt: item.created_at.toISOString(),
  };
}

export const reportExportsService = {
  async exportReport(
    userId: string,
    input: ExportReportRequest,
    context?: ReportExportAuditContext,
  ): Promise<ReportExportItem> {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const format = input.format || 'EXCEL';
    const now = new Date();

    let recordCount = 0;
    const highlights: string[] = [];

    if (input.reportType === 'RISK') {
      const data = await reportExportsRepository.compileRiskData(input);
      recordCount = data.length;
      highlights.push(`Compiled ${recordCount} organizational risk records.`);
    } else if (input.reportType === 'INCIDENT') {
      const data = await reportExportsRepository.compileIncidentData(input);
      recordCount = data.length;
      highlights.push(`Compiled ${recordCount} incident response records.`);
    } else {
      const posture = await reportExportsRepository.compileSecurityPostureData(input);
      recordCount = posture.totalAssets;
      highlights.push(
        `Security posture rated ${posture.postureLevel} (${posture.postureScore}/100) across ${posture.totalAssets} assets.`,
      );
    }

    const filtersRecord = {
      format,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      severity: input.severity || null,
      status: input.status || null,
      recordCount,
    };

    const createdRecord = await reportExportsRepository.createExportRecord({
      reportType: input.reportType,
      requestedBy: actor.id,
      filters: filtersRecord,
      status: 'COMPLETED',
      generatedAt: now,
      auditData: {
        report_type: input.reportType,
        format,
        start_date: filtersRecord.startDate,
        end_date: filtersRecord.endDate,
        severity: filtersRecord.severity,
        status_filter: filtersRecord.status,
        record_count: recordCount,
        export_status: 'COMPLETED',
      },
      ...(context ? { context } : {}),
    });

    return mapReportExportItem(createdRecord, {
      recordCount,
      period:
        input.startDate || input.endDate
          ? `${input.startDate || 'All'} to ${input.endDate || 'Now'}`
          : 'All available records',
      highlights,
    });
  },

  async listExports(userId: string, query: ListExportReportsQuery) {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const { items, totalItems } = await reportExportsRepository.listExports({
      reportType: query.reportType,
      status: query.status,
      skip,
      take: limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const mappedItems: ReportExportItem[] = items.map((item) => mapReportExportItem(item));

    return {
      items: mappedItems,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  },

  async getExportDetail(userId: string, exportId: string): Promise<ReportExportItem> {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const item = await reportExportsRepository.findExportById(exportId);
    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'Report export not found');
    }

    return mapReportExportItem(item);
  },

  async revokeExport(
    userId: string,
    exportId: string,
    reason: string,
    context?: ReportExportAuditContext,
  ): Promise<ReportExportItem> {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const item = await reportExportsRepository.findExportById(exportId);
    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'Report export not found');
    }

    const currentFilters = (item.filters as Record<string, unknown> | null) || {};
    if (currentFilters.isRevoked === true) {
      throw new AppError(400, 'BAD_REQUEST', 'Report export has already been revoked');
    }

    const now = new Date();
    const updatedFilters = {
      ...currentFilters,
      isRevoked: true,
      revokedAt: now.toISOString(),
      revokedBy: `${actor.full_name} (${actor.role})`,
      revocationReason: reason.trim(),
    };

    const beforeData = {
      id: item.id,
      report_type: item.report_type,
      status: item.status,
      filters: currentFilters,
    };

    const afterData = {
      id: item.id,
      report_type: item.report_type,
      status: item.status,
      filters: updatedFilters,
      revocation_reason: reason.trim(),
    };

    const updated = await reportExportsRepository.updateExportFilters(
      exportId,
      updatedFilters,
      {
        actorUserId: actor.id,
        beforeData,
        afterData,
        ...(context ? { context } : {}),
      },
    );
    return mapReportExportItem(updated);
  },

  async downloadReport(
    userId: string,
    exportId: string,
    context?: ReportExportAuditContext,
  ): Promise<{ filename: string; contentType: string; content: string | Buffer }> {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const item = await reportExportsRepository.findExportById(exportId);
    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'Report export not found');
    }

    const filters = (item.filters as Record<string, unknown> | null) || {};
    const format = (filters.format as ReportFormat) || 'EXCEL';
    const reportType = item.report_type as ReportType;

    if (filters.isRevoked === true) {
      // Trace access denial on revoked exports
      await reportExportsRepository.recordDownloadAudit({
        actorUserId: actor.id,
        exportId: item.id,
        outcome: 'DENIED',
        errorCode: 'GONE',
        afterData: { id: item.id, report_type: reportType, format },
        ...(context ? { context } : {}),
      });
      const reason =
        typeof filters.revocationReason === 'string' ? `: ${filters.revocationReason}` : '';
      throw new AppError(410, 'GONE', `Report export has been revoked${reason}`);
    }

    const dateStr = item.created_at.toISOString().slice(0, 10);

    const safeFilters: ExportReportRequest = {
      reportType,
      format,
      startDate: typeof filters.startDate === 'string' ? filters.startDate : undefined,
      endDate: typeof filters.endDate === 'string' ? filters.endDate : undefined,
      severity: typeof filters.severity === 'string' ? filters.severity : undefined,
      status: typeof filters.status === 'string' ? filters.status : undefined,
    };

    let file: { filename: string; contentType: string; content: string | Buffer };
    if (format === 'PDF') {
      const pdfBuffer = await renderSecurityReportPdf(reportType, item, safeFilters);
      file = {
        filename: `securaai-${reportType.toLowerCase()}-report-${dateStr}.pdf`,
        contentType: 'application/pdf',
        content: pdfBuffer,
      };
    } else if (format === 'EXCEL') {
      const excelBuffer = await renderSecurityReportXlsx(reportType, item, safeFilters);
      file = {
        filename: `securaai-${reportType.toLowerCase()}-report-${dateStr}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: excelBuffer,
      };
    } else {
      // Default: CSV with UTF-8 BOM (\uFEFF)
      const csvContent = await renderSecurityReportCsv(reportType, item, safeFilters);
      file = {
        filename: `securaai-${reportType.toLowerCase()}-report-${dateStr}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: csvContent,
      };
    }

    await reportExportsRepository.recordDownloadAudit({
      actorUserId: actor.id,
      exportId: item.id,
      outcome: 'SUCCESS',
      afterData: {
        id: item.id,
        report_type: reportType,
        format,
        filename: file.filename,
      },
      ...(context ? { context } : {}),
    });

    return file;
  },
};

