import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { ViewIncidentsQuery } from './dto/view-incidents.dto.js';
import type { ClassifyIncidentSeverity } from './dto/classify-incident-severity.dto.js';
import type {
  CreateIncidentFromSource,
  IncidentSourceOptionsQuery,
} from './dto/create-incident-from-source.dto.js';

export const incidentViewSelect = {
  id: true,
  incident_code: true,
  title: true,
  description: true,
  severity: true,
  status: true,
  handler_user_id: true,
  detected_at: true,
  confirmed_at: true,
  closed_at: true,
  created_at: true,
  updated_at: true,
  users_incidents_created_byTousers: {
    select: { id: true, full_name: true, email: true },
  },
  users_incidents_handler_user_idTousers: {
    select: { id: true, full_name: true, email: true },
  },
  security_findings: {
    select: {
      id: true,
      alert_id: true,
      title: true,
      status: true,
    },
  },
  _count: {
    select: {
      incident_actions: true,
      incident_assets: true,
      incident_controls: true,
      incident_evidence: true,
      incident_risks: true,
    },
  },
} satisfies Prisma.incidentsSelect;

export const incidentDetailSelect = {
  ...incidentViewSelect,
  incident_assets: {
    orderBy: [{ linked_at: 'asc' as const }, { asset_id: 'asc' as const }],
    select: {
      linked_at: true,
      assets: {
        select: {
          id: true,
          asset_code: true,
          name: true,
          asset_type: true,
          criticality: true,
          status: true,
        },
      },
      users: { select: { id: true, full_name: true, email: true } },
    },
  },
  incident_actions: {
    orderBy: [{ performed_at: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      phase: true,
      description: true,
      performed_at: true,
      users: { select: { id: true, full_name: true, email: true } },
    },
  },
} satisfies Prisma.incidentsSelect;

export type IncidentViewRecord = Prisma.incidentsGetPayload<{
  select: typeof incidentViewSelect;
}>;

export type IncidentDetailRecord = Prisma.incidentsGetPayload<{
  select: typeof incidentDetailSelect;
}>;

export const incidentsRepository = {
  classificationHistory(incidentId: string, page: number, limit: number) {
    const where = {
      resource_type: 'INCIDENT',
      resource_id: incidentId,
      action: 'INCIDENT_SEVERITY_CLASSIFIED',
      outcome: 'SUCCESS' as const,
    };
    return prisma.$transaction([
      prisma.audit_logs.count({ where }),
      prisma.audit_logs.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          occurred_at: true,
          before_data: true,
          after_data: true,
          users: { select: { id: true, full_name: true } },
        },
      }),
    ]);
  },
  async classificationMetadata(incidentIds: string[]) {
    const where = {
      resource_type: 'INCIDENT',
      resource_id: { in: incidentIds },
      action: 'INCIDENT_SEVERITY_CLASSIFIED',
      outcome: 'SUCCESS' as const,
    };
    const [counts, latest] = await prisma.$transaction([
      prisma.audit_logs.groupBy({
        by: ['resource_id'],
        where,
        orderBy: { resource_id: 'asc' },
        _count: { _all: true },
      }),
      prisma.audit_logs.findMany({
        where,
        distinct: ['resource_id'],
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        take: incidentIds.length,
        select: {
          resource_id: true,
          occurred_at: true,
          after_data: true,
          users: { select: { id: true, full_name: true } },
        },
      }),
    ]);
    return {
      counts: counts.map((item) => ({
        resourceId: item.resource_id,
        count: typeof item._count === 'object' ? (item._count._all ?? 0) : 0,
      })),
      latest,
    };
  },

  classifySeverity(userId: string, incidentId: string, input: ClassifyIncidentSeverity) {
    return prisma.$transaction(
      async (transaction) => {
        const actor = await transaction.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'SECURITY_OFFICER') {
          return { outcome: 'forbidden' as const };
        }
        await transaction.$queryRaw`SELECT id FROM public.incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
        const current = await transaction.incidents.findUnique({
          where: { id: incidentId },
          select: { status: true, severity: true, updated_at: true },
        });
        if (!current) return { outcome: 'not_found' as const };
        if (current.status === 'CLOSED') return { outcome: 'closed' as const };
        if (
          input.expectedUpdatedAt &&
          current.updated_at.getTime() !== new Date(input.expectedUpdatedAt).getTime()
        ) {
          return { outcome: 'conflict' as const };
        }
        const at = new Date();
        const changed = await transaction.incidents.updateMany({
          where: { id: incidentId, status: { not: 'CLOSED' } },
          data: { severity: input.severity.toUpperCase(), updated_at: at },
        });
        if (changed.count !== 1) return { outcome: 'conflict' as const };
        const id = randomUUID();
        const before = { severity: current.severity.toLowerCase() };
        const after = { severity: input.severity, rationale: input.rationale };
        await transaction.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            action: 'INCIDENT_SEVERITY_CLASSIFIED',
            resource_type: 'INCIDENT',
            resource_id: incidentId,
            occurred_at: at,
            source: 'API',
            before_data: before,
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, userId, incidentId, at, before, after }))
              .digest('hex'),
          },
        });
        const incident = await transaction.incidents.findUniqueOrThrow({
          where: { id: incidentId },
          select: incidentViewSelect,
        });
        return { outcome: 'classified' as const, incident };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  list(query: ViewIncidentsQuery) {
    const where: Prisma.incidentsWhereInput = {
      ...(query.search
        ? {
            OR: [
              { incident_code: { contains: query.search, mode: 'insensitive' as const } },
              { title: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.severity
        ? { severity: { equals: query.severity, mode: 'insensitive' as const } }
        : {}),
      ...(query.status
        ? { status: query.status.toUpperCase() as Prisma.Enumincident_statusFilter }
        : {}),
    };
    return prisma.$transaction([
      prisma.incidents.count({ where }),
      prisma.incidents.findMany({
        where,
        select: incidentViewSelect,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },

  findById(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { id: incidentId },
      select: incidentDetailSelect,
    });
  },

  listSourceOptions(query: IncidentSourceOptionsQuery) {
    const where: Prisma.security_findingsWhereInput = {
      incidents: null,
      anomaly_alerts: { status: 'CONFIRMED' },
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' as const } },
              { description: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.security_findings.count({ where }),
      prisma.security_findings.findMany({
        where,
        orderBy: [{ identified_at: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          alert_id: true,
          title: true,
          description: true,
          severity: true,
          status: true,
          identified_at: true,
          anomaly_alerts: { select: { generated_at: true } },
        },
      }),
    ]);
  },

  createFromSource(userId: string, input: CreateIncidentFromSource) {
    if (input.sourceType === 'manual') {
      return prisma.incidents
        .create({
          data: {
            incident_code: `INC-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
            title: input.title,
            description: input.description,
            severity: input.severity.toUpperCase(),
            status: 'OPEN',
            detected_at: input.detectedAt ?? new Date(),
            created_by: userId,
          },
          select: incidentViewSelect,
        })
        .then((incident) => ({ outcome: 'created' as const, incident }));
    }
    return prisma.$transaction(async (transaction) => {
      const finding = await transaction.security_findings.findFirst({
        where: input.sourceType === 'alert' ? { alert_id: input.sourceId } : { id: input.sourceId },
        select: {
          id: true,
          status: true,
          identified_at: true,
          incidents: { select: { id: true, incident_code: true } },
          anomaly_alerts: { select: { id: true, status: true } },
        },
      });
      if (!finding) return { outcome: 'not_found' as const };
      if (finding.anomaly_alerts.status !== 'CONFIRMED') {
        return { outcome: 'not_confirmed' as const };
      }
      if (finding.incidents) {
        return { outcome: 'already_converted' as const, incident: finding.incidents };
      }

      const claimed = await transaction.security_findings.updateMany({
        where: { id: finding.id, status: { not: 'CONVERTED_TO_INCIDENT' }, incidents: null },
        data: { status: 'CONVERTED_TO_INCIDENT', updated_at: new Date() },
      });
      if (claimed.count !== 1) return { outcome: 'conflict' as const };

      const now = new Date();
      const incident = await transaction.incidents.create({
        data: {
          incident_code: `INC-${finding.id.replaceAll('-', '').slice(0, 16).toUpperCase()}`,
          finding_id: finding.id,
          title: input.title,
          description: input.description,
          severity: input.severity.toUpperCase(),
          status: 'OPEN',
          detected_at: input.detectedAt ?? finding.identified_at,
          confirmed_at: now,
          created_by: userId,
        },
        select: incidentViewSelect,
      });
      return { outcome: 'created' as const, incident };
    });
  },
};
