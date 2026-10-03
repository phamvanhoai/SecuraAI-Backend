import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { ViewIncidentsQuery } from './dto/view-incidents.dto.js';
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

export type IncidentViewRecord = Prisma.incidentsGetPayload<{
  select: typeof incidentViewSelect;
}>;

export const incidentsRepository = {
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
      select: incidentViewSelect,
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
