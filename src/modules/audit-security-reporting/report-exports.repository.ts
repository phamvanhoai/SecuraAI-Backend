import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type {
  ExportReportRequest,
} from './dto/export-security-reports.dto.js';
import type {
  audit_outcome,
  incident_status,
  Prisma,
  report_export_status,
  risk_status,
} from '@prisma/client';

export type ReportExportAuditContext = {
  sourceIp?: string;
  userAgent?: string;
};

type ReportExportAuditEvent = {
  actorUserId: string;
  action: string;
  resourceId: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  outcome?: audit_outcome;
  errorCode?: string;
  context?: ReportExportAuditContext;
};

const reportExportInclude = {
  users: {
    select: { id: true, full_name: true, role: true, email: true },
  },
} as const;

/**
 * Appends one report-export audit record linked to the latest audit hash.
 * Must run inside the transaction that performs the audited change.
 */
async function appendReportExportAudit(
  tx: Prisma.TransactionClient,
  event: ReportExportAuditEvent,
): Promise<void> {
  const previous = await tx.audit_logs.findFirst({
    orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    select: { record_hash: true },
  });
  const occurredAt = new Date();
  const outcome = event.outcome ?? 'SUCCESS';

  const recordHash = createHash('sha256')
    .update(
      JSON.stringify({
        previousHash: previous?.record_hash ?? null,
        actorUserId: event.actorUserId,
        action: event.action,
        resourceType: 'REPORT_EXPORT',
        resourceId: event.resourceId,
        outcome,
        errorCode: event.errorCode ?? null,
        beforeData: event.beforeData ?? null,
        afterData: event.afterData ?? null,
        occurredAt: occurredAt.toISOString(),
      }),
    )
    .digest('hex');

  await tx.audit_logs.create({
    data: {
      actor_user_id: event.actorUserId,
      actor_type: 'USER',
      action: event.action,
      resource_type: 'REPORT_EXPORT',
      resource_id: event.resourceId,
      occurred_at: occurredAt,
      source: 'API',
      outcome,
      ...(event.errorCode ? { error_code: event.errorCode } : {}),
      ...(event.beforeData ? { before_data: event.beforeData as Prisma.InputJsonValue } : {}),
      ...(event.afterData ? { after_data: event.afterData as Prisma.InputJsonValue } : {}),
      ...(event.context?.sourceIp ? { source_ip: event.context.sourceIp.slice(0, 45) } : {}),
      ...(event.context?.userAgent ? { user_agent: event.context.userAgent.slice(0, 500) } : {}),
      ...(previous ? { previous_hash: previous.record_hash } : {}),
      record_hash: recordHash,
    },
  });
}

function parseStartDate(dateStr: string): Date {
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function parseEndDate(dateStr: string): Date {
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return new Date(`${dateOnly}T23:59:59.999Z`);
}

export const reportExportsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, full_name: true },
    });
  },

  /**
   * Creates the export record and its REPORT_EXPORT_GENERATED audit event atomically.
   * The identifier is generated first so storage_uri points to the real record.
   */
  createExportRecord(data: {
    reportType: string;
    requestedBy: string;
    filters: Prisma.InputJsonValue;
    status: report_export_status;
    generatedAt?: Date;
    auditData: Record<string, unknown>;
    context?: ReportExportAuditContext;
  }) {
    const id = randomUUID();
    const now = data.generatedAt ?? new Date();
    return prisma.$transaction(async (tx) => {
      const created = await tx.report_exports.create({
        data: {
          id,
          report_type: data.reportType,
          requested_by: data.requestedBy,
          filters: data.filters,
          status: data.status,
          storage_uri: `/api/v1/reports/exports/${id}/download`,
          created_at: now,
          generated_at: now,
        },
        include: reportExportInclude,
      });

      await appendReportExportAudit(tx, {
        actorUserId: data.requestedBy,
        action: 'REPORT_EXPORT_GENERATED',
        resourceId: id,
        afterData: { id, ...data.auditData },
        ...(data.context ? { context: data.context } : {}),
      });

      return created;
    });
  },

  /** Records a download attempt for an existing export (successful or denied). */
  recordDownloadAudit(event: {
    actorUserId: string;
    exportId: string;
    outcome: audit_outcome;
    afterData: Record<string, unknown>;
    errorCode?: string;
    context?: ReportExportAuditContext;
  }): Promise<void> {
    return prisma.$transaction((tx) =>
      appendReportExportAudit(tx, {
        actorUserId: event.actorUserId,
        action: 'REPORT_EXPORT_DOWNLOADED',
        resourceId: event.exportId,
        outcome: event.outcome,
        afterData: event.afterData,
        ...(event.errorCode ? { errorCode: event.errorCode } : {}),
        ...(event.context ? { context: event.context } : {}),
      }),
    );
  },

  async listExports(params: {
    requestedByUserId?: string | undefined;
    reportType?: string | undefined;
    status?: report_export_status | undefined;
    skip: number;
    take: number;
    sortBy: 'createdAt' | 'generatedAt' | 'reportType' | 'status';
    sortOrder: 'asc' | 'desc';
  }) {
    const securityReportTypes = ['RISK', 'INCIDENT', 'SECURITY_POSTURE'];
    const where: Prisma.report_exportsWhereInput = {
      ...(params.requestedByUserId ? { requested_by: params.requestedByUserId } : {}),
      report_type: params.reportType ? params.reportType : { in: securityReportTypes },
      ...(params.status ? { status: params.status } : {}),
    };

    const orderByMap: Record<string, Prisma.report_exportsOrderByWithRelationInput> = {
      createdAt: { created_at: params.sortOrder },
      generatedAt: { generated_at: params.sortOrder },
      reportType: { report_type: params.sortOrder },
      status: { status: params.sortOrder },
    };

    const [items, totalItems] = await Promise.all([
      prisma.report_exports.findMany({
        where,
        skip: Number(params.skip) || 0,
        take: Number(params.take) || 10,
        orderBy: orderByMap[params.sortBy] ?? { created_at: 'desc' },
        include: {
          users: {
            select: { id: true, full_name: true, role: true, email: true },
          },
        },
      }),
      prisma.report_exports.count({ where }),
    ]);

    return { items, totalItems };
  },

  findExportById(id: string) {
    return prisma.report_exports.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true, full_name: true, role: true, email: true },
        },
      },
    });
  },

  async updateExportFilters(
    id: string,
    updatedFilters: Prisma.InputJsonValue,
    auditMeta?: {
      actorUserId: string;
      beforeData: Record<string, unknown>;
      afterData: Record<string, unknown>;
      context?: ReportExportAuditContext;
    },
  ) {
    if (!auditMeta) {
      return prisma.report_exports.update({
        where: { id },
        data: {
          filters: updatedFilters,
        },
        include: reportExportInclude,
      });
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.report_exports.update({
        where: { id },
        data: {
          filters: updatedFilters,
        },
        include: reportExportInclude,
      });

      await appendReportExportAudit(tx, {
        actorUserId: auditMeta.actorUserId,
        action: 'REVOKE_REPORT_EXPORT',
        resourceId: id,
        beforeData: auditMeta.beforeData,
        afterData: auditMeta.afterData,
        ...(auditMeta.context ? { context: auditMeta.context } : {}),
      });

      return updated;
    });
  },

  async compileRiskData(filters: ExportReportRequest) {
    const where: Prisma.risksWhereInput = {};
    if (filters.status) {
      where.status = filters.status as risk_status;
    }
    if (filters.startDate || filters.endDate) {
      where.created_at = {
        ...(filters.startDate ? { gte: parseStartDate(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: parseEndDate(filters.endDate) } : {}),
      };
    }

    const risks = await prisma.risks.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 500,
      select: {
        id: true,
        risk_code: true,
        title: true,
        description: true,
        status: true,
        created_at: true,
        risk_assessments: {
          take: 1,
          orderBy: { created_at: 'desc' },
          select: {
            inherent_rating: true,
            residual_rating: true,
            control_effectiveness: true,
          },
        },
      },
    });

    return risks;
  },

  async compileIncidentData(filters: ExportReportRequest) {
    const where: Prisma.incidentsWhereInput = {};
    if (filters.severity) {
      where.severity = { equals: filters.severity, mode: 'insensitive' };
    }
    if (filters.status) {
      where.status = filters.status as incident_status;
    }
    if (filters.startDate || filters.endDate) {
      where.created_at = {
        ...(filters.startDate ? { gte: parseStartDate(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: parseEndDate(filters.endDate) } : {}),
      };
    }

    const incidents = await prisma.incidents.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 500,
      select: {
        id: true,
        incident_code: true,
        title: true,
        severity: true,
        status: true,
        detected_at: true,
        created_at: true,
        handler_user_id: true,
        users_incidents_created_byTousers: {
          select: { full_name: true },
        },
      },
    });

    return incidents;
  },

  async compileSecurityPostureData(_filters: ExportReportRequest) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalAssets,
      criticalAssets,
      totalRisks,
      openRisks,
      totalIncidents,
      openIncidents,
      totalControls,
      openFindings,
      totalEvents24h,
      totalAlerts24h,
    ] = await Promise.all([
      prisma.assets.count({ where: { archived_at: null } }),
      prisma.assets.count({
        where: { archived_at: null, criticality: { in: ['CRITICAL', 'HIGH'] } },
      }),
      prisma.risks.count(),
      prisma.risks.count({ where: { status: { in: ['OPEN', 'UNDER_TREATMENT'] } } }),
      prisma.incidents.count(),
      prisma.incidents.count({ where: { status: { not: 'CLOSED' } } }),
      prisma.security_controls.count(),
      prisma.control_findings.count({ where: { status: 'OPEN' } }),
      prisma.normalized_events.count({ where: { ingested_at: { gte: since24h } } }),
      prisma.anomaly_alerts.count({ where: { generated_at: { gte: since24h } } }),
    ]);

    const complianceRate =
      totalControls > 0
        ? Math.max(0, Math.min(100, Math.round(((totalControls - openFindings) / totalControls) * 100)))
        : 100;

    const incidentDeduction = Math.min(40, openIncidents * 10);
    const riskDeduction = Math.min(30, openRisks * 5);
    const findingDeduction = Math.min(20, openFindings * 3);
    const alertDeduction = Math.min(10, totalAlerts24h * 2);

    const postureScore = Math.max(
      0,
      Math.min(100, 100 - (incidentDeduction + riskDeduction + findingDeduction + alertDeduction)),
    );

    let postureLevel = 'STRONG';
    if (postureScore < 50) postureLevel = 'CRITICAL';
    else if (postureScore < 70) postureLevel = 'NEEDS_ATTENTION';
    else if (postureScore < 85) postureLevel = 'ADEQUATE';

    return {
      postureScore,
      postureLevel,
      complianceRate,
      totalAssets,
      criticalAssets,
      totalRisks,
      openRisks,
      totalIncidents,
      openIncidents,
      totalEvents24h,
      totalAlerts24h,
      openFindings,
    };
  },
};
