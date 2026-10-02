import { AppError } from '../../common/errors/app-error.js';
import type { ViewIncidentsQuery } from './dto/view-incidents.dto.js';
import { incidentsRepository, type IncidentViewRecord } from './incidents.repository.js';

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
    relatedCounts: {
      actions: incident._count.incident_actions,
      assets: incident._count.incident_assets,
      controls: incident._count.incident_controls,
      evidence: incident._count.incident_evidence,
      risks: incident._count.incident_risks,
    },
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
    return mapIncident(incident);
  },
};
