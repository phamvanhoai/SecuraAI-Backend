import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { auditWriter } from '../audit-security-reporting/audit-writer.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { ViewIncidentsQuery } from './dto/view-incidents.dto.js';
import type { ClassifyIncidentSeverity } from './dto/classify-incident-severity.dto.js';
import type { AssignIncidentHandler } from './dto/assign-incident-handler.dto.js';
import type { RecordRecoveryAction } from './dto/record-recovery-action.dto.js';
import { requireRecordPhase } from './incident-workflow.js';
import { relatedTitleTerms } from './incident-related.js';
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
  incident_controls: {
    orderBy: [{ linked_at: 'asc' as const }, { control_id: 'asc' as const }],
    select: { linked_at: true, security_controls: { select: { id: true, control_code: true, name: true } } },
  },
  incident_risks: {
    orderBy: [{ linked_at: 'asc' as const }, { risk_id: 'asc' as const }],
    select: { linked_at: true, risks: { select: { id: true, risk_code: true, title: true, status: true } } },
  },
  control_findings: {
    where: { finding_type: 'CONTROL_WEAKNESS' },
    orderBy: [{ identified_at: 'asc' as const }, { id: 'asc' as const }],
    select: { id: true, severity: true, description: true, status: true, identified_at: true, security_controls: { select: { id: true, control_code: true, name: true } } },
  },
  risk_reassessment_requests: {
    orderBy: [{ requested_at: 'asc' as const }, { id: 'asc' as const }],
    select: { id: true, reason: true, status: true, requested_at: true, reviewed_at: true, review_comment: true, risks: { select: { id: true, risk_code: true, title: true } } },
  },
} satisfies Prisma.incidentsSelect;

export type IncidentViewRecord = Prisma.incidentsGetPayload<{
  select: typeof incidentViewSelect;
}> & { assignment_at?: Date | null };

type IncidentDetailPayload = Prisma.incidentsGetPayload<{ select: typeof incidentDetailSelect }>;
export type IncidentDetailRecord = Omit<
  IncidentDetailPayload,
  'control_findings' | 'incident_controls' | 'incident_risks' | 'risk_reassessment_requests'
> & {
  control_findings?: IncidentDetailPayload['control_findings'];
  incident_controls?: IncidentDetailPayload['incident_controls'];
  incident_risks?: IncidentDetailPayload['incident_risks'];
  risk_reassessment_requests?: IncidentDetailPayload['risk_reassessment_requests'];
  assignment_at?: Date | null;
};

// Attach assignment timestamps from recorded handler audit history.
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
  // Read paginated actions restricted to the CONTAINMENT phase.
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
  // Record a completed containment action without advancing the incident phase.
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
        const after = { actionId: action.id, phase: 'CONTAINMENT', ...input, status };
        await auditWriter.record({
            actorType: 'USER',
            actorUserId: userId,
            resourceType: 'INCIDENT',
            resourceId: incidentId,
            action: 'INCIDENT_CONTAINMENT_RECORDED',
            source: 'API',
            occurredAt: at,
            beforeData: { status: incident.status },
            afterData: after,
        }, tx);
        return { outcome: 'recorded' as const, action };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  // Read paginated actions restricted to the ERADICATION phase.
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
  // Record a completed eradication action without advancing the incident phase.
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
        const after = { actionId: action.id, phase: 'ERADICATION', ...input, status };
        await auditWriter.record({
            actorType: 'USER',
            actorUserId: userId,
            resourceType: 'INCIDENT',
            resourceId: incidentId,
            action: 'INCIDENT_ERADICATION_RECORDED',
            source: 'API',
            occurredAt: at,
            beforeData: { status: incident.status },
            afterData: after,
        }, tx);
        return { outcome: 'recorded' as const, action };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  // Read paginated actions restricted to the RECOVERY phase.
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
  // Record a completed recovery action without advancing the incident phase.
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
        const after = { actionId: action.id, phase: 'RECOVERY', ...input, status };
        await auditWriter.record({
            actorType: 'USER',
            actorUserId: userId,
            resourceType: 'INCIDENT',
            resourceId: incidentId,
            action: 'INCIDENT_RECOVERY_RECORDED',
            source: 'API',
            occurredAt: at,
            beforeData: { status: incident.status },
            afterData: after,
        }, tx);
        return { outcome: 'recorded' as const, action };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  // Read paginated handler changes for the incident.
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
  // Resolve handler display names in one batch for assignment history.
  handlerNames(ids: string[]) {
    return prisma.users.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true },
    });
  },
  // Return active Security Officers eligible to handle incidents.
  assignmentOptions() {
    return prisma.users.findMany({
      where: { role: 'SECURITY_OFFICER', status: 'ACTIVE' },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
      select: { id: true, full_name: true, email: true },
    });
  },
  // Validate the handler and revision before saving an audited assignment.
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
        const before = { assigneeUserId: current.handler_user_id, status: current.status };
        const after = {
          assigneeUserId: input.assigneeUserId,
          note: input.note,
          status: current.status,
        };
        await auditWriter.record({
            actorType: 'USER',
            actorUserId: userId,
            action: 'INCIDENT_HANDLER_ASSIGNED',
            resourceType: 'INCIDENT',
            resourceId: incidentId,
            occurredAt: at,
            source: 'API',
            beforeData: before,
            afterData: after,
        }, transaction);
        const incident = await transaction.incidents.findUniqueOrThrow({
          where: { id: incidentId },
          select: incidentViewSelect,
        });
        return { outcome: 'assigned' as const, incident, changed: true, assignedAt: at };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  // Read paginated severity-classification history for the incident.
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
  // Collect severity-classification metadata for a batch of incident IDs.
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

  // Classify an incident with a rationale and stale-state checks.
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
        const before = { severity: current.severity.toLowerCase(), status: current.status };
        const after = {
          severity: input.severity,
          rationale: input.rationale,
          status: current.status,
        };
        await auditWriter.record({
            actorType: 'USER',
            actorUserId: userId,
            action: 'INCIDENT_SEVERITY_CLASSIFIED',
            resourceType: 'INCIDENT',
            resourceId: incidentId,
            occurredAt: at,
            source: 'API',
            beforeData: before,
            afterData: after,
        }, transaction);
        const incident = await transaction.incidents.findUniqueOrThrow({
          where: { id: incidentId },
          select: incidentViewSelect,
        });
        return { outcome: 'classified' as const, incident };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  // Read only the actor fields needed for authorization.
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  // Read a filtered incident page and enrich its selected metadata.
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

  // Read a paginated incident list restricted to its creator.
  async listCreatedBy(userId: string, query: ViewIncidentsQuery) {
    const where: Prisma.incidentsWhereInput = { created_by: userId };
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

  // Read one incident with the selected investigation relationships.
  async findById(incidentId: string): Promise<IncidentDetailRecord | null> {
    const record = await prisma.incidents.findUnique({
      where: { id: incidentId },
      select: incidentDetailSelect,
    });
    if (!record) return null;
    return (await withAssignmentTimes([record]))[0] ?? null;
  },

  // List confirmed finding sources available for incident creation.
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

  // Create an OPEN incident manually or claim a confirmed finding before conversion.
  createFromSource(userId: string, input: CreateIncidentFromSource) {
    return prisma.$transaction(async (transaction) => {
      const actor = await transaction.users.findUnique({
        where: { id: userId },
        select: { role: true, status: true },
      });
      if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'SECURITY_OFFICER') {
        throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
      }
      const checkRelated = async (detectedAt: Date): Promise<void> => {
        const window = 7 * 24 * 60 * 60 * 1000;
        const records = await transaction.incidents.findMany({
          where: {
            OR: [
              {
                detected_at: {
                  gte: new Date(detectedAt.getTime() - window),
                  lte: new Date(detectedAt.getTime() + window),
                },
              },
              {
                detected_at: null,
                created_at: {
                  gte: new Date(detectedAt.getTime() - window),
                  lte: new Date(detectedAt.getTime() + window),
                },
              },
            ],
          },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 200,
          select: {
            id: true,
            incident_code: true,
            title: true,
            status: true,
            detected_at: true,
            created_at: true,
          },
        });
        const items = records
          .flatMap((record) => {
            const shared = relatedTitleTerms(input.title, record.title);
            return shared.length
              ? [
                  {
                    id: record.id,
                    incidentCode: record.incident_code,
                    title: record.title,
                    status: record.status.toLowerCase(),
                    detectedAt: record.detected_at ?? record.created_at,
                    reason: `Shared title terms: ${shared.join(', ')}; detection times within 7 days.`,
                  },
                ]
              : [];
          })
          .sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed'))
          .slice(0, 5);
        if (
          items.length &&
          (!input.separateReason ||
            items.some((item) => !input.reviewedIncidentIds?.includes(item.id)))
        ) {
          throw new AppError(
            409,
            'INCIDENT_RELATED_REVIEW_REQUIRED',
            'Review potentially related incidents before creating a separate incident.',
            { items },
          );
        }
      };
      const recordSeparateDecision = async (incidentId: string): Promise<void> => {
        if (!input.separateReason) return;
        await auditWriter.record(
          {
            actorUserId: userId,
            action: 'INCIDENT_CREATED_SEPARATELY',
            resourceType: 'INCIDENT',
            resourceId: incidentId,
            afterData: {
              reason: input.separateReason,
              reviewedIncidentIds: input.reviewedIncidentIds ?? [],
            },
          },
          transaction,
        );
      };
      if (input.sourceType === 'manual') {
        await checkRelated(input.detectedAt ?? new Date());
        const incident = await transaction.incidents.create({
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
        });
        await recordSeparateDecision(incident.id);
        return { outcome: 'created' as const, incident };
      }
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

      await checkRelated(input.detectedAt ?? finding.identified_at);

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
      await recordSeparateDecision(incident.id);
      return { outcome: 'created' as const, incident };
    });
  },
};
