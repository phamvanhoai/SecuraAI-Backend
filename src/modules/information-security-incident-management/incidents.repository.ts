import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { ViewIncidentsQuery } from './dto/view-incidents.dto.js';
import type { ClassifyIncidentSeverity } from './dto/classify-incident-severity.dto.js';
import type { AssignIncidentHandler } from './dto/assign-incident-handler.dto.js';
import type { RecordRecoveryAction } from './dto/record-recovery-action.dto.js';
import { requireRecordPhase } from './incident-workflow.js';
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
  incident_analysis: { select: { id: true } },
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
}> & { assignment_at?: Date | null };

export type IncidentDetailRecord = Prisma.incidentsGetPayload<{
  select: typeof incidentDetailSelect;
}> & { assignment_at?: Date | null };

async function withAssignmentTimes<T extends { id: string; handler_user_id: string | null }>(
  records: T[],
) {
  const ids = records.filter((record) => record.handler_user_id).map((record) => record.id);
  if (!ids.length) return records;
  const audits = await prisma.audit_logs.findMany({
    where: {
      resource_type: 'INCIDENT',
      resource_id: { in: ids },
      action: 'INCIDENT_HANDLER_ASSIGNED',
      outcome: 'SUCCESS',
    },
    distinct: ['resource_id'],
    orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    take: ids.length,
    select: { resource_id: true, occurred_at: true, after_data: true },
  });
  return records.map((record) => {
    const entry = audits.find((audit) => audit.resource_id === record.id);
    const payload = entry?.after_data;
    const matches =
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      payload.assigneeUserId === record.handler_user_id;
    return { ...record, assignment_at: matches ? entry.occurred_at : null };
  });
}

export const incidentsRepository = {
  containmentHistory(incidentId: string, page: number, limit: number) {
    const where = { incident_id: incidentId, phase: 'CONTAINMENT' as const };
    return prisma.$transaction([
      prisma.incident_actions.count({ where }),
      prisma.incident_actions.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ performed_at: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          description: true,
          performed_at: true,
          created_at: true,
          users: { select: { id: true, full_name: true } },
        },
      }),
    ]);
  },
  recordContainment(
    userId: string,
    incidentId: string,
    input: { description: string; performedAt: string },
  ) {
    return prisma.$transaction(
      async (tx) => {
        const actor = await tx.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.role !== 'SECURITY_OFFICER' || actor.status !== 'ACTIVE')
          return { outcome: 'forbidden' as const };
        await tx.$queryRaw`SELECT id FROM public.incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
        const incident = await tx.incidents.findUnique({
          where: { id: incidentId },
          select: { status: true },
        });
        if (!incident) return { outcome: 'not_found' as const };
        if (incident.status === 'CLOSED') return { outcome: 'closed' as const };
        const at = new Date();
        const performedAt = new Date(input.performedAt);
        if (performedAt.getTime() > at.getTime()) return { outcome: 'future_time' as const };
        requireRecordPhase(incident.status, 'CONTAINMENT');
        const action = await tx.incident_actions.create({
          data: {
            incident_id: incidentId,
            phase: 'CONTAINMENT',
            description: input.description,
            performed_by: userId,
            performed_at: performedAt,
          },
          select: {
            id: true,
            description: true,
            performed_at: true,
            created_at: true,
            users: { select: { id: true, full_name: true } },
          },
        });
        const status = incident.status;
        await tx.incidents.update({ where: { id: incidentId }, data: { updated_at: at, status } });
        const id = randomUUID();
        const after = { actionId: action.id, phase: 'CONTAINMENT', ...input, status };
        await tx.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            resource_type: 'INCIDENT',
            resource_id: incidentId,
            action: 'INCIDENT_CONTAINMENT_RECORDED',
            source: 'API',
            occurred_at: at,
            before_data: { status: incident.status },
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, userId, incidentId, at, after }))
              .digest('hex'),
          },
        });
        return { outcome: 'recorded' as const, action };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  eradicationHistory(incidentId: string, page: number, limit: number) {
    const where = { incident_id: incidentId, phase: 'ERADICATION' as const };
    return prisma.$transaction([
      prisma.incident_actions.count({ where }),
      prisma.incident_actions.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ performed_at: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          description: true,
          performed_at: true,
          created_at: true,
          users: { select: { id: true, full_name: true } },
        },
      }),
    ]);
  },
  recordEradication(
    userId: string,
    incidentId: string,
    input: { description: string; performedAt: string },
  ) {
    return prisma.$transaction(
      async (tx) => {
        const actor = await tx.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.role !== 'SECURITY_OFFICER' || actor.status !== 'ACTIVE')
          return { outcome: 'forbidden' as const };
        await tx.$queryRaw`SELECT id FROM public.incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
        const incident = await tx.incidents.findUnique({
          where: { id: incidentId },
          select: { status: true },
        });
        if (!incident) return { outcome: 'not_found' as const };
        if (incident.status === 'CLOSED') return { outcome: 'closed' as const };
        const at = new Date();
        const performedAt = new Date(input.performedAt);
        if (performedAt.getTime() > at.getTime()) return { outcome: 'future_time' as const };
        requireRecordPhase(incident.status, 'ERADICATION');
        const action = await tx.incident_actions.create({
          data: {
            incident_id: incidentId,
            phase: 'ERADICATION',
            description: input.description,
            performed_by: userId,
            performed_at: performedAt,
          },
          select: {
            id: true,
            description: true,
            performed_at: true,
            created_at: true,
            users: { select: { id: true, full_name: true } },
          },
        });
        const status = incident.status;
        await tx.incidents.update({ where: { id: incidentId }, data: { updated_at: at, status } });
        const id = randomUUID();
        const after = { actionId: action.id, phase: 'ERADICATION', ...input, status };
        await tx.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            resource_type: 'INCIDENT',
            resource_id: incidentId,
            action: 'INCIDENT_ERADICATION_RECORDED',
            source: 'API',
            occurred_at: at,
            before_data: { status: incident.status },
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, userId, incidentId, at, after }))
              .digest('hex'),
          },
        });
        return { outcome: 'recorded' as const, action };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  recoveryHistory(incidentId: string, page: number, limit: number) {
    const where = { incident_id: incidentId, phase: 'RECOVERY' as const };
    return prisma.$transaction([
      prisma.incident_actions.count({ where }),
      prisma.incident_actions.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ performed_at: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          description: true,
          performed_at: true,
          created_at: true,
          users: { select: { id: true, full_name: true } },
        },
      }),
    ]);
  },
  recordRecovery(userId: string, incidentId: string, input: RecordRecoveryAction) {
    return prisma.$transaction(
      async (tx) => {
        const actor = await tx.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.role !== 'SECURITY_OFFICER' || actor.status !== 'ACTIVE')
          return { outcome: 'forbidden' as const };
        await tx.$queryRaw`SELECT id FROM public.incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
        const incident = await tx.incidents.findUnique({
          where: { id: incidentId },
          select: { status: true },
        });
        if (!incident) return { outcome: 'not_found' as const };
        if (incident.status === 'CLOSED') return { outcome: 'closed' as const };
        const at = new Date();
        const performedAt = new Date(input.performedAt);
        if (performedAt.getTime() > at.getTime()) return { outcome: 'future_time' as const };
        requireRecordPhase(incident.status, 'RECOVERY');
        const action = await tx.incident_actions.create({
          data: {
            incident_id: incidentId,
            phase: 'RECOVERY',
            description: input.description,
            performed_by: userId,
            performed_at: performedAt,
          },
          select: {
            id: true,
            description: true,
            performed_at: true,
            created_at: true,
            users: { select: { id: true, full_name: true } },
          },
        });
        const status = incident.status;
        await tx.incidents.update({ where: { id: incidentId }, data: { updated_at: at, status } });
        const id = randomUUID();
        const after = { actionId: action.id, phase: 'RECOVERY', ...input, status };
        await tx.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            resource_type: 'INCIDENT',
            resource_id: incidentId,
            action: 'INCIDENT_RECOVERY_RECORDED',
            source: 'API',
            occurred_at: at,
            before_data: { status: incident.status },
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, userId, incidentId, at, after }))
              .digest('hex'),
          },
        });
        return { outcome: 'recorded' as const, action };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  assignmentHistory(incidentId: string, page: number, limit: number) {
    const where = {
      resource_type: 'INCIDENT',
      resource_id: incidentId,
      action: 'INCIDENT_HANDLER_ASSIGNED',
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
  handlerNames(ids: string[]) {
    return prisma.users.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true },
    });
  },
  assignmentOptions() {
    return prisma.users.findMany({
      where: { role: 'SECURITY_OFFICER', status: 'ACTIVE' },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
      select: { id: true, full_name: true, email: true },
    });
  },
  assignHandler(userId: string, incidentId: string, input: AssignIncidentHandler) {
    return prisma.$transaction(
      async (transaction) => {
        const actor = await transaction.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.role !== 'SECURITY_OFFICER' || actor.status !== 'ACTIVE')
          return { outcome: 'forbidden' as const };
        await transaction.$queryRaw`SELECT id FROM public.incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
        const current = await transaction.incidents.findUnique({
          where: { id: incidentId },
          select: { status: true, handler_user_id: true, updated_at: true },
        });
        if (!current) return { outcome: 'not_found' as const };
        if (current.status === 'CLOSED') return { outcome: 'closed' as const };
        if (
          input.expectedUpdatedAt &&
          current.updated_at.getTime() !== new Date(input.expectedUpdatedAt).getTime()
        )
          return { outcome: 'conflict' as const };
        const handler = await transaction.users.findUnique({
          where: { id: input.assigneeUserId },
          select: { role: true, status: true },
        });
        if (!handler || handler.role !== 'SECURITY_OFFICER' || handler.status !== 'ACTIVE')
          return { outcome: 'invalid_handler' as const };
        const at = new Date();
        if (current.handler_user_id === input.assigneeUserId) {
          const incident = await transaction.incidents.findUniqueOrThrow({
            where: { id: incidentId },
            select: incidentViewSelect,
          });
          return { outcome: 'assigned' as const, incident, changed: false, assignedAt: null };
        }
        await transaction.incidents.update({
          where: { id: incidentId },
          data: {
            handler_user_id: input.assigneeUserId,
            updated_at: at,
          },
        });
        const id = randomUUID();
        const before = { assigneeUserId: current.handler_user_id, status: current.status };
        const after = {
          assigneeUserId: input.assigneeUserId,
          note: input.note,
          status: current.status,
        };
        await transaction.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            action: 'INCIDENT_HANDLER_ASSIGNED',
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
        return { outcome: 'assigned' as const, incident, changed: true, assignedAt: at };
      },
      { isolationLevel: 'Serializable' },
    );
  },
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
          data: {
            severity: input.severity.toUpperCase(),
            updated_at: at,
          },
        });
        if (changed.count !== 1) return { outcome: 'conflict' as const };
        const id = randomUUID();
        const before = { severity: current.severity.toLowerCase(), status: current.status };
        const after = {
          severity: input.severity,
          rationale: input.rationale,
          status: current.status,
        };
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

  async list(query: ViewIncidentsQuery) {
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
    const [total, records] = await prisma.$transaction([
      prisma.incidents.count({ where }),
      prisma.incidents.findMany({
        where,
        select: incidentViewSelect,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return [total, await withAssignmentTimes(records)] as const;
  },

  async findById(incidentId: string) {
    const record = await prisma.incidents.findUnique({
      where: { id: incidentId },
      select: incidentDetailSelect,
    });
    if (!record) return null;
    return (await withAssignmentTimes([record]))[0] ?? null;
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
