import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { MyIncidentsQuery, ReportIncidentInput } from './dto/report-incident.dto.js';
export const incidentManagementRepository = {
  createReport(
    input: ReportIncidentInput,
    actorUserId: string,
    incidentCode: string,
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(async (tx) => {
      const incident = await tx.incidents.create({
        data: {
          incident_code: incidentCode,
          title: input.title,
          description: input.description,
          category: input.category,
          status: 'reported',
          reported_by_user_id: actorUserId,
          ...(input.occurredAt ? { occurred_at: new Date(input.occurredAt) } : {}),
        },
        select: {
          incident_id: true,
          incident_code: true,
          title: true,
          description: true,
          category: true,
          severity: true,
          status: true,
          occurred_at: true,
          detected_at: true,
          created_at: true,
        },
      });
      await tx.audit_logs.create({
        data: {
          actor_user_id: actorUserId,
          module: 'incident-management',
          action: 'incident.reported',
          entity_type: 'incident',
          entity_id: incident.incident_id,
          after_data: {
            incidentId: incident.incident_id,
            incidentCode: incident.incident_code,
            title: incident.title,
            category: incident.category,
            severity: incident.severity,
            status: incident.status,
            occurredAt: incident.occurred_at?.toISOString() ?? null,
            detectedAt: incident.detected_at.toISOString(),
          },
          ...context,
        },
      });
      return incident;
    });
  },
  async listOwnReports(userId: string, query: MyIncidentsQuery) {
    const where = { reported_by_user_id: userId } satisfies Prisma.incidentsWhereInput;
    const [items, total] = await prisma.$transaction([
      prisma.incidents.findMany({
        where,
        select: {
          incident_id: true,
          incident_code: true,
          title: true,
          category: true,
          severity: true,
          status: true,
          occurred_at: true,
          detected_at: true,
          created_at: true,
        },
        orderBy: [{ created_at: 'desc' }, { incident_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.incidents.count({ where }),
    ]);
    return { items, total };
  },
  findOwnReport(incidentId: string, userId: string) {
    return prisma.incidents.findFirst({
      where: { incident_id: incidentId, reported_by_user_id: userId },
      select: {
        incident_id: true,
        incident_code: true,
        title: true,
        description: true,
        category: true,
        severity: true,
        status: true,
        occurred_at: true,
        detected_at: true,
        created_at: true,
      },
    });
  },
} as const;
