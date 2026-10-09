import { AppError } from '../../common/errors/app-error.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ClassifyIncidentSeverity } from './dto/classify-incident-severity.dto.js';
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

function mapActor(actor: { id: string; full_name: string; email: string } | null) {
  return actor ? { id: actor.id, name: actor.full_name, email: actor.email } : null;
}

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
    classificationCount: 0,
    lastClassification: null,
    currentAssignment: incident.users_incidents_handler_user_idTousers
      ? {
          assignedAt: null,
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
    responseActions,
    handlingHistory,
  };
}

async function requireViewer(userId: string): Promise<void> {
  const actor = await incidentsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
  }
}

async function requireSecurityOfficer(userId: string): Promise<void> {
  const actor = await incidentsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'SECURITY_OFFICER') {
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
  }
}

export const incidentsService = {
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

  async detail(userId: string, incidentId: string) {
    await requireViewer(userId);
    const incident = await incidentsRepository.findById(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const metadata = await classificationMetadata([incidentId]);
    return { ...mapIncidentDetail(incident), ...metadata.get(incidentId) };
  },

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
