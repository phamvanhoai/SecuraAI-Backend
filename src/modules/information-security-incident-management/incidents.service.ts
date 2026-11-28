import { AppError } from '../../common/errors/app-error.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { incidentProgressRepository } from './incident-progress.repository.js';
import type { IncidentProgress } from './dto/incident-progress.dto.js';
import type { ClassifyIncidentSeverity } from './dto/classify-incident-severity.dto.js';
import type { AssignIncidentHandler } from './dto/assign-incident-handler.dto.js';
import type { RecordRecoveryAction } from './dto/record-recovery-action.dto.js';
import type { ViewIncidentsQuery } from './dto/view-incidents.dto.js';
import type {
  CreateIncidentFromSource,
  IncidentSourceOptionsQuery,
} from './dto/create-incident-from-source.dto.js';
import {
  incidentsRepository,
  type IncidentDetailRecord,
  type IncidentViewRecord,
} from './incidents.repository.js';

// Map Actor database fields into the API response.
function mapActor(actor: { id: string; full_name: string; email: string } | null) {
  return actor ? { id: actor.id, name: actor.full_name, email: actor.email } : null;
}

// Map Incident database fields into the API response.
function mapIncident(incident: IncidentViewRecord) {
  return {
    id: incident.id,
    incidentCode: incident.incident_code,
    title: incident.title,
    description: incident.description,
    category: null,
    severity: incident.severity.toLowerCase(),
    status: incident.status.toLowerCase(),
    occurredAt: incident.detected_at,
    detectedAt: incident.detected_at,
    confirmedAt: incident.confirmed_at,
    closedAt: incident.closed_at,
    createdAt: incident.created_at,
    updatedAt: incident.updated_at,
    classified: true,
    hasAnalysis: Boolean(incident.incident_analysis),
    classificationCount: 0,
    lastClassification: null,
    currentAssignment: incident.users_incidents_handler_user_idTousers
      ? {
          assignedAt: incident.assignment_at ?? null,
          assignee: mapActor(incident.users_incidents_handler_user_idTousers),
        }
      : null,
    createdBy: mapActor(incident.users_incidents_created_byTousers),
    source: incident.security_findings
      ? {
          findingId: incident.security_findings.id,
          alertId: incident.security_findings.alert_id,
          title: incident.security_findings.title,
          findingStatus: incident.security_findings.status.toLowerCase(),
        }
      : null,
    relatedCounts: {
      actions: incident._count.incident_actions,
      assets: incident._count.incident_assets,
      controls: incident._count.incident_controls,
      evidence: incident._count.incident_evidence,
      risks: incident._count.incident_risks,
    },
  };
}

// Collect severity-classification metadata for a batch of incident IDs.
async function classificationMetadata(incidentIds: string[]) {
  const { counts, latest } = await incidentsRepository.classificationMetadata(incidentIds);
  return new Map(
    latest.map((entry) => {
      const payload = z.object({ rationale: z.string() }).safeParse(entry.after_data);
      const count = counts.find((item) => item.resourceId === entry.resource_id)?.count;
      return [
        entry.resource_id,
        {
          classificationCount: count ?? 0,
          lastClassification: {
            classifiedAt: entry.occurred_at,
            classifiedBy: entry.users ? { id: entry.users.id, name: entry.users.full_name } : null,
            rationale: payload.success ? payload.data.rationale : null,
          },
        },
      ];
    }),
  );
}

// Map IncidentDetail database fields into the API response.
function mapIncidentDetail(incident: IncidentDetailRecord) {
  const base = mapIncident(incident);
  const responseActions = incident.incident_actions.map((action) => ({
    id: action.id,
    phase: action.phase.toLowerCase(),
    description: action.description,
    performedAt: action.performed_at,
    performedBy: mapActor(action.users),
  }));
  const handlingHistory = [
    {
      id: `reported-${incident.id}`,
      type: 'reported',
      description: 'Incident report created',
      occurredAt: incident.created_at,
      actor: mapActor(incident.users_incidents_created_byTousers),
      phase: null,
    },
    ...(incident.confirmed_at
      ? [
          {
            id: `confirmed-${incident.id}`,
            type: 'confirmed',
            description: 'Incident confirmed',
            occurredAt: incident.confirmed_at,
            actor: null,
            phase: null,
          },
        ]
      : []),
    ...responseActions.map((action) => ({
      id: action.id,
      type: 'response_action',
      description: action.description,
      occurredAt: action.performedAt,
      actor: action.performedBy,
      phase: action.phase,
    })),
    ...(incident.closed_at
      ? [
          {
            id: `closed-${incident.id}`,
            type: 'closed',
            description: 'Incident closed',
            occurredAt: incident.closed_at,
            actor: null,
            phase: null,
          },
        ]
      : []),
  ].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());

  return {
    ...base,
    affectedAssets: incident.incident_assets.map((link) => ({
      id: link.assets.id,
      assetCode: link.assets.asset_code,
      name: link.assets.name,
      assetType: link.assets.asset_type,
      criticality: link.assets.criticality,
      status: link.assets.status.toLowerCase(),
      linkedAt: link.linked_at,
      linkedBy: mapActor(link.users),
    })),
    linkedControls: (incident.incident_controls ?? []).map((link) => ({
      id: link.security_controls.id,
      controlCode: link.security_controls.control_code,
      name: link.security_controls.name,
      linkedAt: link.linked_at,
    })),
    linkedRisks: (incident.incident_risks ?? []).map((link) => ({
      id: link.risks.id,
      riskCode: link.risks.risk_code,
      title: link.risks.title,
      status: link.risks.status,
      linkedAt: link.linked_at,
    })),
    controlWeaknesses: (incident.control_findings ?? []).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      description: finding.description,
      status: finding.status,
      identifiedAt: finding.identified_at,
      control: finding.security_controls,
    })),
    riskReassessmentRequests: (incident.risk_reassessment_requests ?? []).map((request) => ({
      id: request.id,
      reason: request.reason,
      status: request.status,
      requestedAt: request.requested_at,
      reviewedAt: request.reviewed_at,
      reviewComment: request.review_comment,
      risk: request.risks,
    })),
    responseActions,
    handlingHistory,
  };
}

// Require an active account with incident viewing access.
async function requireViewer(userId: string): Promise<void> {
  const actor = await incidentsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
  }
}

// Require an active Security Officer before incident changes.
async function requireSecurityOfficer(userId: string): Promise<void> {
  const actor = await incidentsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'SECURITY_OFFICER') {
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
  }
}

// Require an active account before applying reporter-specific access checks.
async function requireActiveReporter(userId: string) {
  const actor = await incidentsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return actor;
}

export const incidentsService = {
  // Require a Security Officer and translate phase-update transaction conflicts.
  async updatePhase(userId: string, incidentId: string, input: IncidentProgress) {
    await requireSecurityOfficer(userId);
    try {
      return mapIncident(await incidentProgressRepository.update(userId, incidentId, input));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(409, 'INCIDENT_STALE', 'The incident changed. Refresh and try again');
      throw error;
    }
  },
  // Read recorded incident phase transitions with pagination.
  async phaseHistory(userId: string, incidentId: string, query: { page: number; limit: number }) {
    await requireViewer(userId);
    if (!(await incidentsRepository.findById(incidentId)))
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const [total, records] = await incidentProgressRepository.history(
      incidentId,
      query.page,
      query.limit,
    );
    return {
      items: records.map((record) => ({
        id: record.id,
        occurredAt: record.occurred_at,
        actor: record.users ? { id: record.users.id, name: record.users.full_name } : null,
        before: record.before_data,
        after: record.after_data,
      })),
      pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) },
    };
  },
  // Read paginated actions restricted to the CONTAINMENT phase.
  async containmentHistory(
    userId: string,
    incidentId: string,
    query: { page: number; limit: number },
  ) {
    await requireViewer(userId);
    if (!(await incidentsRepository.findById(incidentId)))
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const [total, records] = await incidentsRepository.containmentHistory(
      incidentId,
      query.page,
      query.limit,
    );
    return {
      items: records.map((action) => ({
        id: action.id,
        phase: 'containment',
        description: action.description,
        performedAt: action.performed_at,
        recordedAt: action.created_at,
        performedBy: { id: action.users.id, name: action.users.full_name },
      })),
      pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) },
    };
  },
  // Record a completed containment action without advancing the incident phase.
  async recordContainment(
    userId: string,
    incidentId: string,
    input: { description: string; performedAt: string },
  ) {
    await requireSecurityOfficer(userId);
    try {
      const result = await incidentsRepository.recordContainment(userId, incidentId, input);
      if (result.outcome === 'forbidden')
        throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
      if (result.outcome === 'not_found')
        throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
      if (result.outcome === 'closed')
        throw new AppError(409, 'INCIDENT_CLOSED', 'Closed incidents cannot receive new actions');
      if (result.outcome === 'future_time')
        throw new AppError(422, 'INVALID_PERFORMED_AT', 'Performed time cannot be in the future');
      const action = result.action;
      return {
        id: action.id,
        phase: 'containment',
        description: action.description,
        performedAt: action.performed_at,
        recordedAt: action.created_at,
        performedBy: { id: action.users.id, name: action.users.full_name },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(409, 'INCIDENT_STALE', 'The incident changed. Refresh and try again');
      throw error;
    }
  },
  // Read paginated actions restricted to the ERADICATION phase.
  async eradicationHistory(
    userId: string,
    incidentId: string,
    query: { page: number; limit: number },
  ) {
    await requireViewer(userId);
    if (!(await incidentsRepository.findById(incidentId)))
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const [total, records] = await incidentsRepository.eradicationHistory(
      incidentId,
      query.page,
      query.limit,
    );
    return {
      items: records.map((action) => ({
        id: action.id,
        phase: 'eradication',
        description: action.description,
        performedAt: action.performed_at,
        recordedAt: action.created_at,
        performedBy: { id: action.users.id, name: action.users.full_name },
      })),
      pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) },
    };
  },
  // Record a completed eradication action without advancing the incident phase.
  async recordEradication(
    userId: string,
    incidentId: string,
    input: { description: string; performedAt: string },
  ) {
    await requireSecurityOfficer(userId);
    try {
      const result = await incidentsRepository.recordEradication(userId, incidentId, input);
      if (result.outcome === 'forbidden')
        throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
      if (result.outcome === 'not_found')
        throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
      if (result.outcome === 'closed')
        throw new AppError(409, 'INCIDENT_CLOSED', 'Closed incidents cannot receive new actions');
      if (result.outcome === 'future_time')
        throw new AppError(422, 'INVALID_PERFORMED_AT', 'Performed time cannot be in the future');
      const action = result.action;
      return {
        id: action.id,
        phase: 'eradication',
        description: action.description,
        performedAt: action.performed_at,
        recordedAt: action.created_at,
        performedBy: { id: action.users.id, name: action.users.full_name },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(409, 'INCIDENT_STALE', 'The incident changed. Refresh and try again');
      throw error;
    }
  },
  // Read paginated actions restricted to the RECOVERY phase.
  async recoveryHistory(
    userId: string,
    incidentId: string,
    query: { page: number; limit: number },
  ) {
    await requireViewer(userId);
    if (!(await incidentsRepository.findById(incidentId)))
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const [total, records] = await incidentsRepository.recoveryHistory(
      incidentId,
      query.page,
      query.limit,
    );
    return {
      items: records.map((action) => ({
        id: action.id,
        phase: 'recovery',
        description: action.description,
        performedAt: action.performed_at,
        recordedAt: action.created_at,
        performedBy: { id: action.users.id, name: action.users.full_name },
      })),
      pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) },
    };
  },
  // Record a completed recovery action without advancing the incident phase.
  async recordRecovery(userId: string, incidentId: string, input: RecordRecoveryAction) {
    await requireSecurityOfficer(userId);
    try {
      const result = await incidentsRepository.recordRecovery(userId, incidentId, input);
      if (result.outcome === 'forbidden')
        throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
      if (result.outcome === 'not_found')
        throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
      if (result.outcome === 'closed')
        throw new AppError(409, 'INCIDENT_CLOSED', 'Closed incidents cannot receive new actions');
      if (result.outcome === 'future_time')
        throw new AppError(422, 'INVALID_PERFORMED_AT', 'Performed time cannot be in the future');
      const action = result.action;
      return {
        id: action.id,
        phase: 'recovery',
        description: action.description,
        performedAt: action.performed_at,
        recordedAt: action.created_at,
        performedBy: { id: action.users.id, name: action.users.full_name },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(409, 'INCIDENT_STALE', 'The incident changed. Refresh and try again');
      throw error;
    }
  },
  // Read paginated handler changes for the incident.
  async assignmentHistory(
    userId: string,
    incidentId: string,
    query: { page: number; limit: number },
  ) {
    await requireViewer(userId);
    if (!(await incidentsRepository.findById(incidentId)))
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const [total, records] = await incidentsRepository.assignmentHistory(
      incidentId,
      query.page,
      query.limit,
    );
    const beforeSchema = z.object({ assigneeUserId: z.uuid().nullable() });
    const afterSchema = z.object({ assigneeUserId: z.uuid(), note: z.string() });
    const entries = records.map((record) => ({
      record,
      before: beforeSchema.safeParse(record.before_data),
      after: afterSchema.safeParse(record.after_data),
    }));
    const ids = [
      ...new Set(
        entries
          .flatMap((entry) => [
            entry.before.success ? entry.before.data.assigneeUserId : null,
            entry.after.success ? entry.after.data.assigneeUserId : null,
          ])
          .filter((id): id is string => id !== null),
      ),
    ];
    const names = new Map(
      (await incidentsRepository.handlerNames(ids)).map((user) => [user.id, user.full_name]),
    );
    const handler = (id: string | null) =>
      id ? { id, name: names.get(id) ?? 'Unknown handler' } : null;
    return {
      items: entries.map(({ record, before, after }) => ({
        id: record.id,
        assignedAt: record.occurred_at,
        assignedBy: record.users ? { id: record.users.id, name: record.users.full_name } : null,
        previousHandler: before.success ? handler(before.data.assigneeUserId) : null,
        handler: after.success ? handler(after.data.assigneeUserId) : null,
        note: after.success ? after.data.note : null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  // Return active Security Officers eligible to handle incidents.
  async assignmentOptions(userId: string) {
    await requireSecurityOfficer(userId);
    return { users: (await incidentsRepository.assignmentOptions()).map(mapActor) };
  },
  // Validate the handler and revision before saving an audited assignment.
  async assignHandler(userId: string, incidentId: string, input: AssignIncidentHandler) {
    await requireSecurityOfficer(userId);
    try {
      const result = await incidentsRepository.assignHandler(userId, incidentId, input);
      if (result.outcome === 'forbidden')
        throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
      if (result.outcome === 'not_found')
        throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
      if (result.outcome === 'closed')
        throw new AppError(409, 'INCIDENT_CLOSED', 'Closed incidents cannot be reassigned');
      if (result.outcome === 'conflict')
        throw new AppError(409, 'INCIDENT_STALE', 'The incident changed. Refresh and try again');
      if (result.outcome === 'invalid_handler')
        throw new AppError(409, 'INVALID_INCIDENT_HANDLER', 'Select an active Security Officer');
      const incident = mapIncident(result.incident);
      return {
        ...incident,
        changed: result.changed,
        currentAssignment: incident.currentAssignment
          ? { ...incident.currentAssignment, assignedAt: result.assignedAt }
          : null,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(409, 'INCIDENT_STALE', 'The incident changed. Refresh and try again');
      throw error;
    }
  },
  // Read paginated severity-classification history for the incident.
  async classificationHistory(
    userId: string,
    incidentId: string,
    query: { page: number; limit: number },
  ) {
    await requireViewer(userId);
    if (!(await incidentsRepository.findById(incidentId))) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }
    const [total, records] = await incidentsRepository.classificationHistory(
      incidentId,
      query.page,
      query.limit,
    );
    const severity = z.enum(['low', 'medium', 'high', 'critical']);
    return {
      items: records.map((record) => {
        const before = z.object({ severity }).safeParse(record.before_data);
        const after = z.object({ severity, rationale: z.string() }).safeParse(record.after_data);
        return {
          id: record.id,
          classifiedAt: record.occurred_at,
          classifiedBy: record.users ? { id: record.users.id, name: record.users.full_name } : null,
          previousSeverity: before.success ? before.data.severity : null,
          severity: after.success ? after.data.severity : null,
          rationale: after.success ? after.data.rationale : null,
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  // Read a filtered incident page and enrich its selected metadata.
  async list(userId: string, query: ViewIncidentsQuery) {
    await requireViewer(userId);
    const [total, incidents] = await incidentsRepository.list(query);
    const metadata = await classificationMetadata(incidents.map((incident) => incident.id));
    return {
      items: incidents.map((incident) => ({
        ...mapIncident(incident),
        ...metadata.get(incident.id),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Read incidents created by the authenticated reporter.
  async listMine(userId: string, query: ViewIncidentsQuery) {
    await requireActiveReporter(userId);
    const [total, incidents] = await incidentsRepository.listCreatedBy(userId, query);
    const metadata = await classificationMetadata(incidents.map((incident) => incident.id));
    return {
      items: incidents.map((incident) => ({
        ...mapIncident(incident),
        ...metadata.get(incident.id),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Allow operational viewers or the original reporter to read incident details.
  async detail(userId: string, incidentId: string) {
    const actor = await requireActiveReporter(userId);
    const incident = await incidentsRepository.findById(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const canViewAll = actor.role === 'SECURITY_OFFICER' || actor.role === 'EXECUTIVE';
    if (!canViewAll && incident.users_incidents_created_byTousers.id !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only view incidents you reported');
    }
    const metadata = await classificationMetadata([incidentId]);
    return { ...mapIncidentDetail(incident), ...metadata.get(incidentId) };
  },

  // Classify an incident with a rationale and stale-state checks.
  async classifySeverity(userId: string, incidentId: string, input: ClassifyIncidentSeverity) {
    await requireSecurityOfficer(userId);
    try {
      const result = await incidentsRepository.classifySeverity(userId, incidentId, input);
      if (result.outcome === 'forbidden')
        throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
      if (result.outcome === 'not_found')
        throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
      if (result.outcome === 'closed')
        throw new AppError(409, 'INCIDENT_CLOSED', 'Closed incidents cannot be reclassified');
      if (result.outcome === 'conflict')
        throw new AppError(409, 'INCIDENT_STALE', 'The incident changed. Refresh and try again');
      const metadata = await classificationMetadata([incidentId]);
      return { ...mapIncident(result.incident), ...metadata.get(incidentId) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new AppError(409, 'INCIDENT_STALE', 'The incident changed. Refresh and try again');
      }
      throw error;
    }
  },

  // List confirmed finding sources available for incident creation.
  async listSourceOptions(userId: string, query: IncidentSourceOptionsQuery) {
    await requireSecurityOfficer(userId);
    const [total, findings] = await incidentsRepository.listSourceOptions(query);
    return {
      items: findings.map((finding) => ({
        findingId: finding.id,
        alertId: finding.alert_id,
        title: finding.title,
        description: finding.description,
        severity: finding.severity?.toLowerCase() ?? 'medium',
        findingStatus: finding.status.toLowerCase(),
        detectedAt: finding.anomaly_alerts.generated_at,
        identifiedAt: finding.identified_at,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Create an OPEN incident manually or claim a confirmed finding before conversion.
  async createFromSource(userId: string, input: CreateIncidentFromSource) {
    await requireSecurityOfficer(userId);
    const result = await incidentsRepository.createFromSource(userId, input);
    if (result.outcome === 'not_found') {
      throw new AppError(404, 'INCIDENT_SOURCE_NOT_FOUND', 'Confirmed alert or finding not found');
    }
    if (result.outcome === 'not_confirmed') {
      throw new AppError(409, 'INCIDENT_SOURCE_NOT_CONFIRMED', 'The source alert is not confirmed');
    }
    if (result.outcome === 'already_converted') {
      throw new AppError(
        409,
        'INCIDENT_SOURCE_ALREADY_CONVERTED',
        `The source is already linked to incident ${result.incident.incident_code}`,
      );
    }
    if (result.outcome === 'conflict') {
      throw new AppError(
        409,
        'INCIDENT_SOURCE_CONFLICT',
        'The source changed; refresh and try again',
      );
    }
    return mapIncident(result.incident);
  },
};
