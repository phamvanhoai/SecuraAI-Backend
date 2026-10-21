import { createHash } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type {
  ExportReportRequest,
  ListExportReportsQuery,
} from './dto/export-security-reports.dto.js';
import type { Prisma, report_export_status } from '@prisma/client';

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

  createExportRecord(data: {
    reportType: string;
    requestedBy: string;
    filters: Prisma.InputJsonValue;
    status: report_export_status;
    storageUri: string;
    generatedAt?: Date;
  }) {
    const now = new Date();
    return prisma.report_exports.create({
      data: {
        report_type: data.reportType,
        requested_by: data.requestedBy,
        filters: data.filters,
        status: data.status,
        storage_uri: data.storageUri,
        created_at: now,
        generated_at: now,
      },
      include: {
        users: {
          select: { id: true, full_name: true, role: true, email: true },
        },
      },
    });
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
    },
  ) {
    if (!auditMeta) {
      return prisma.report_exports.update({
        where: { id },
        data: {
          filters: updatedFilters,
        },
        include: {
          users: {
            select: { id: true, full_name: true, role: true, email: true },
          },
        },
      });
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.report_exports.update({
        where: { id },
        data: {
          filters: updatedFilters,
        },
        include: {
          users: {
            select: { id: true, full_name: true, role: true, email: true },
          },
        },
      });

      const previous = await tx.audit_logs.findFirst({
        orderBy: { occurred_at: 'desc' },
        select: { record_hash: true },
      });

      const recordHash = createHash('sha256')
        .update(
          JSON.stringify({
            previousHash: previous?.record_hash ?? null,
            actorUserId: auditMeta.actorUserId,
            resourceId: id,
            action: 'REVOKE_REPORT_EXPORT',
            beforeData: auditMeta.beforeData,
            afterData: auditMeta.afterData,
          }),
        )
        .digest('hex');

      await tx.audit_logs.create({
        data: {
          actor_user_id: auditMeta.actorUserId,
          actor_type: 'USER',
          action: 'REVOKE_REPORT_EXPORT',
          resource_type: 'REPORT_EXPORT',
          resource_id: id,
          source: 'API',
          before_data: auditMeta.beforeData as Prisma.InputJsonValue,
          after_data: auditMeta.afterData as Prisma.InputJsonValue,
          ...(previous ? { previous_hash: previous.record_hash } : {}),
          record_hash: recordHash,
        },
      });

      return updated;
    });
  },

  async compileRiskData(filters: ExportReportRequest) {
    const where: Prisma.risksWhereInput = {};
    if (filters.status) {
      where.status = filters.status as any;
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
      where.status = filters.status as any;
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

  async compileSecurityPostureData(filters: ExportReportRequest) {
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
