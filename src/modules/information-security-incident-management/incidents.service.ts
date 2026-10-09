import { AppError } from '../../common/errors/app-error.js';
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
  async list(userId: string, query: ViewIncidentsQuery) {
    await requireViewer(userId);
    const [total, incidents] = await incidentsRepository.list(query);
    return {
      items: incidents.map(mapIncident),
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
    return mapIncidentDetail(incident);
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
