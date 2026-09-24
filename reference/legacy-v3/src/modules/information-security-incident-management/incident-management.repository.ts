import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type {
  ClassificationQueueQuery,
  AssignIncidentInput,
  UpdateIncidentProgressInput,
  UploadIncidentEvidenceInput,
  IncidentEvidenceQuery,
  RemoveIncidentEvidenceInput,
  ClassifyIncidentInput,
  MyIncidentsQuery,
  ReportIncidentInput,
} from './dto/report-incident.dto.js';
type RequestContext = { ipAddress: string | null; userAgent: string | null };
const auditRequestContext = (
  context: RequestContext,
): Pick<Prisma.audit_logsUncheckedCreateInput, 'ip_address' | 'user_agent'> => ({
  ip_address: context.ipAddress,
  user_agent: context.userAgent,
});
const incidentEvidenceSelect = {
  incident_evidence_id: true,
  description: true,
  created_at: true,
  users: { select: { user_id: true, full_name: true } },
  files: {
    select: {
      file_id: true,
      original_name: true,
      storage_key: true,
      mime_type: true,
      size_bytes: true,
      checksum: true,
    },
  },
} satisfies Prisma.incident_evidenceSelect;
type RemovableEvidence = {
  incident_evidence_id: string;
  incident_id: string;
  description: string | null;
  created_at: Date;
  uploaded_by_user_id: string | null;
  files: {
    file_id: string;
    original_name: string;
    mime_type: string | null;
    size_bytes: bigint | null;
    checksum: string | null;
  };
};
export const incidentManagementRepository = {
  findIncident(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { incident_id: incidentId },
      select: {
        incident_id: true,
        status: true,
        incident_assignments: {
          where: { completed_at: null },
          select: { assignee_user_id: true },
          orderBy: [{ assigned_at: 'desc' }, { incident_assignment_id: 'desc' }],
          take: 1,
        },
      },
    });
  },
  async listEvidence(incidentId: string, query: IncidentEvidenceQuery) {
    const where = { incident_id: incidentId } satisfies Prisma.incident_evidenceWhereInput;
    const [items, total] = await prisma.$transaction([
      prisma.incident_evidence.findMany({
        where,
        select: incidentEvidenceSelect,
        orderBy: [{ created_at: 'desc' }, { incident_evidence_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.incident_evidence.count({ where }),
    ]);
    return { items, total };
  },
  findEvidence(evidenceId: string) {
    return prisma.incident_evidence.findUnique({
      where: { incident_evidence_id: evidenceId },
      select: {
        incident_evidence_id: true,
        incident_id: true,
        description: true,
        created_at: true,
        uploaded_by_user_id: true,
        incidents: {
          select: {
            status: true,
            incident_assignments: {
              where: { completed_at: null },
              select: { assignee_user_id: true },
              orderBy: [{ assigned_at: 'desc' }, { incident_assignment_id: 'desc' }],
              take: 1,
            },
          },
        },
        files: {
          select: {
            file_id: true,
            storage_key: true,
            original_name: true,
            mime_type: true,
            size_bytes: true,
            checksum: true,
          },
        },
      },
    });
  },
  removeEvidence(
    evidence: RemovableEvidence,
    input: RemoveIncidentEvidenceInput,
    actorUserId: string,
    isCoordinator: boolean,
    context: RequestContext,
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.incident_evidence.findUnique({
        where: { incident_evidence_id: evidence.incident_evidence_id },
        select: {
          incidents: {
            select: {
              status: true,
              incident_assignments: {
                where: { completed_at: null },
                select: { assignee_user_id: true },
                orderBy: [{ assigned_at: 'desc' }, { incident_assignment_id: 'desc' }],
                take: 1,
              },
            },
          },
        },
      });
      if (!current) return { outcome: 'not_found' as const };
      if (current.incidents.status === 'closed') return { outcome: 'closed' as const };
      if (
        !isCoordinator &&
        current.incidents.incident_assignments[0]?.assignee_user_id !== actorUserId
      )
        return { outcome: 'not_handler' as const };
      const removed = await tx.incident_evidence.deleteMany({
        where: { incident_evidence_id: evidence.incident_evidence_id },
      });
      if (!removed.count) return { outcome: 'not_found' as const };
      await tx.files.delete({ where: { file_id: evidence.files.file_id } });
      await tx.audit_logs.create({
        data: {
          actor_user_id: actorUserId,
          module: 'incident-management',
          action: 'incident.evidence_removed',
          entity_type: 'incident_evidence',
          entity_id: evidence.incident_evidence_id,
          before_data: {
            incidentId: evidence.incident_id,
            fileId: evidence.files.file_id,
            originalName: evidence.files.original_name,
            mimeType: evidence.files.mime_type,
            sizeBytes:
              evidence.files.size_bytes === null ? null : Number(evidence.files.size_bytes),
            checksum: evidence.files.checksum,
            description: evidence.description,
            uploadedByUserId: evidence.uploaded_by_user_id,
            createdAt: evidence.created_at.toISOString(),
          },
          after_data: { reason: input.reason },
          ...auditRequestContext(context),
        },
      });
      return { outcome: 'removed' as const };
    });
  },
  recordEvidenceDownload(
    evidenceId: string,
    actorUserId: string,
    fileId: string,
    context: RequestContext,
  ) {
    return prisma.audit_logs.create({
      data: {
        actor_user_id: actorUserId,
        module: 'incident-management',
        action: 'incident.evidence_downloaded',
        entity_type: 'incident_evidence',
        entity_id: evidenceId,
        after_data: { fileId },
        ...auditRequestContext(context),
      },
      select: { audit_log_id: true },
    });
  },
  createEvidence(
    input: UploadIncidentEvidenceInput & {
      incidentId: string;
      actorUserId: string;
      originalName: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      checksum: string;
      ipAddress: string | null;
      userAgent: string | null;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const file = await tx.files.create({
        data: {
          original_name: input.originalName,
          storage_key: input.storageKey,
          mime_type: input.mimeType,
          size_bytes: BigInt(input.sizeBytes),
          checksum: input.checksum,
          uploaded_by_user_id: input.actorUserId,
        },
        select: { file_id: true },
      });
      const evidence = await tx.incident_evidence.create({
        data: {
          incident_id: input.incidentId,
          file_id: file.file_id,
          description: input.description,
          uploaded_by_user_id: input.actorUserId,
        },
        select: incidentEvidenceSelect,
      });
      await tx.audit_logs.create({
        data: {
          actor_user_id: input.actorUserId,
          module: 'incident-management',
          action: 'incident.evidence_attached',
          entity_type: 'incident_evidence',
          entity_id: evidence.incident_evidence_id,
          after_data: {
            incidentId: input.incidentId,
            fileId: file.file_id,
            originalName: input.originalName,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            checksum: input.checksum,
          },
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
        },
      });
      return evidence;
    });
  },
  listAssignmentOptions() {
    return prisma.users.findMany({
      where: {
        status: 'active',
        deleted_at: null,
        user_roles_user_roles_user_idTousers: {
          some: {
            roles: {
              role_permissions: { some: { permissions: { code: 'incidents.classify' } } },
            },
          },
        },
      },
      select: { user_id: true, full_name: true, email: true },
      orderBy: [{ full_name: 'asc' }, { user_id: 'asc' }],
      take: 200,
    });
  },
  createReport(
    input: ReportIncidentInput,
    actorUserId: string,
    incidentCode: string,
    context: RequestContext,
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
          ...auditRequestContext(context),
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
  async listClassificationQueue(query: ClassificationQueueQuery) {
    const classifiedIncidentRows = query.classification
      ? await prisma.audit_logs.findMany({
          where: { entity_type: 'incident', action: 'incident.severity_classified' },
          select: { entity_id: true },
          distinct: ['entity_id'],
        })
      : [];
    const classifiedIncidentIds = classifiedIncidentRows.flatMap((row) =>
      row.entity_id ? [row.entity_id] : [],
    );
    const where: Prisma.incidentsWhereInput = {
      ...(query.search
        ? {
            OR: [
              { incident_code: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.classification === 'classified'
        ? { incident_id: { in: classifiedIncidentIds } }
        : query.classification === 'unclassified'
          ? { incident_id: { notIn: classifiedIncidentIds } }
          : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.incidents.findMany({
        where,
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
        orderBy: [{ detected_at: 'desc' }, { incident_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.incidents.count({ where }),
    ]);
    const incidentIds = items.map((item) => item.incident_id);
    const classificationAudits = incidentIds.length
      ? await prisma.audit_logs.findMany({
          where: {
            entity_type: 'incident',
            entity_id: { in: incidentIds },
            action: 'incident.severity_classified',
          },
          select: {
            entity_id: true,
            after_data: true,
            created_at: true,
            users: { select: { user_id: true, full_name: true } },
          },
          orderBy: [{ created_at: 'desc' }, { audit_log_id: 'desc' }],
        })
      : [];
    const assignments = incidentIds.length
      ? await prisma.incident_assignments.findMany({
          where: { incident_id: { in: incidentIds }, completed_at: null },
          select: {
            incident_id: true,
            assigned_at: true,
            users_incident_assignments_assignee_user_idTousers: {
              select: { user_id: true, full_name: true, email: true },
            },
          },
          orderBy: [{ assigned_at: 'desc' }, { incident_assignment_id: 'desc' }],
        })
      : [];
    return { items, total, classificationAudits, assignments };
  },
  assignHandler(
    incidentId: string,
    input: AssignIncidentInput,
    actorUserId: string,
    context: RequestContext,
  ) {
    return prisma.$transaction(async (tx) => {
      const [current, assignee] = await Promise.all([
        tx.incidents.findUnique({
          where: { incident_id: incidentId },
          select: { incident_id: true, status: true },
        }),
        tx.users.findFirst({
          where: {
            user_id: input.assigneeUserId,
            status: 'active',
            deleted_at: null,
            user_roles_user_roles_user_idTousers: {
              some: {
                roles: {
                  role_permissions: { some: { permissions: { code: 'incidents.classify' } } },
                },
              },
            },
          },
          select: { user_id: true, full_name: true, email: true },
        }),
      ]);
      if (!current) return { outcome: 'not_found' as const };
      if (current.status === 'resolved' || current.status === 'closed')
        return { outcome: 'terminal' as const };
      if (!assignee) return { outcome: 'invalid_assignee' as const };
      const now = new Date();
      await tx.incident_assignments.updateMany({
        where: { incident_id: incidentId, completed_at: null },
        data: { completed_at: now },
      });
      await tx.incident_assignments.create({
        data: {
          incident_id: incidentId,
          assignee_user_id: assignee.user_id,
          assigned_by_user_id: actorUserId,
          assigned_at: now,
        },
      });
      const status = current.status === 'reported' ? 'assigned' : current.status;
      const incident = await tx.incidents.update({
        where: { incident_id: incidentId },
        data: { status, updated_at: now },
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
      await tx.incident_updates.create({
        data: {
          incident_id: incidentId,
          user_id: actorUserId,
          status_from: current.status,
          status_to: status,
          note: `Assigned to ${assignee.full_name}. ${input.note}`,
        },
      });
      await tx.audit_logs.create({
        data: {
          actor_user_id: actorUserId,
          module: 'incident-management',
          action: 'incident.handler_assigned',
          entity_type: 'incident',
          entity_id: incidentId,
          before_data: { status: current.status },
          after_data: {
            status,
            assigneeUserId: assignee.user_id,
            assigneeName: assignee.full_name,
            note: input.note,
          },
          ...auditRequestContext(context),
        },
      });
      return { outcome: 'assigned' as const, incident, assignee, assignedAt: now };
    });
  },
  updateProgress(
    incidentId: string,
    input: UpdateIncidentProgressInput,
    actorUserId: string,
    canManageAssignments: boolean,
    context: RequestContext,
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.incidents.findUnique({
        where: { incident_id: incidentId },
        select: {
          incident_id: true,
          status: true,
          incident_assignments: {
            where: { completed_at: null },
            select: { incident_assignment_id: true, assignee_user_id: true },
            orderBy: [{ assigned_at: 'desc' }, { incident_assignment_id: 'desc' }],
            take: 1,
          },
        },
      });
      if (!current) return { outcome: 'not_found' as const };
      const activeAssignment = current.incident_assignments[0];
      if (!activeAssignment && !(current.status === 'resolved' && canManageAssignments))
        return { outcome: 'unassigned' as const };
      if (
        activeAssignment &&
        activeAssignment.assignee_user_id !== actorUserId &&
        !canManageAssignments
      )
        return { outcome: 'not_handler' as const };
      if (current.status === input.status) return { outcome: 'unchanged' as const };
      const transitions: Record<string, readonly string[]> = {
        assigned: ['in_progress', 'escalated'],
        in_progress: ['escalated', 'resolved'],
        escalated: ['in_progress', 'resolved'],
        resolved: ['closed'],
      };
      if (!transitions[current.status]?.includes(input.status))
        return { outcome: 'invalid_transition' as const };
      const now = new Date();
      const incident = await tx.incidents.update({
        where: { incident_id: incidentId },
        data: {
          status: input.status,
          updated_at: now,
          ...(input.status === 'escalated' ? { escalated_at: now } : {}),
          ...(input.status === 'resolved' ? { resolved_at: now } : {}),
          ...(input.status === 'closed' ? { closed_at: now } : {}),
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
      await tx.incident_updates.create({
        data: {
          incident_id: incidentId,
          user_id: actorUserId,
          status_from: current.status,
          status_to: input.status,
          note: input.note,
        },
      });
      if (input.status === 'resolved' || input.status === 'closed') {
        await tx.incident_assignments.updateMany({
          where: { incident_id: incidentId, completed_at: null },
          data: { completed_at: now },
        });
      }
      await tx.audit_logs.create({
        data: {
          actor_user_id: actorUserId,
          module: 'incident-management',
          action: 'incident.progress_updated',
          entity_type: 'incident',
          entity_id: incidentId,
          before_data: { status: current.status },
          after_data: { status: input.status, note: input.note },
          ...auditRequestContext(context),
        },
      });
      return { outcome: 'updated' as const, incident };
    });
  },
  classifySeverity(
    incidentId: string,
    input: ClassifyIncidentInput,
    actorUserId: string,
    context: RequestContext,
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.incidents.findUnique({
        where: { incident_id: incidentId },
        select: { incident_id: true, severity: true, status: true },
      });
      if (!current) return { outcome: 'not_found' as const };
      if (current.status === 'closed') return { outcome: 'closed' as const };
      const incident = await tx.incidents.update({
        where: { incident_id: incidentId },
        data: { severity: input.severity, updated_at: new Date() },
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
      await tx.incident_updates.create({
        data: {
          incident_id: incidentId,
          user_id: actorUserId,
          note: `Severity classified from ${current.severity} to ${input.severity}. ${input.rationale}`,
        },
      });
      await tx.audit_logs.create({
        data: {
          actor_user_id: actorUserId,
          module: 'incident-management',
          action: 'incident.severity_classified',
          entity_type: 'incident',
          entity_id: incidentId,
          before_data: { severity: current.severity },
          after_data: { severity: input.severity, rationale: input.rationale },
          ...auditRequestContext(context),
        },
      });
      return { outcome: 'updated' as const, incident };
    });
  },
} as const;
