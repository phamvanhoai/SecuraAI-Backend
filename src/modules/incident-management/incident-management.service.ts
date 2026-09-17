import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import type { MyIncidentsQuery, ReportIncidentInput } from './dto/report-incident.dto.js';
import { incidentManagementRepository } from './incident-management.repository.js';
type Actor = { userId: string; permissions: readonly string[] };
const requireReportPermission = (actor: Actor) => {
  if (!actor.permissions.includes('incidents.report'))
    throw new AppError(403, 'FORBIDDEN', 'Incident reporting permission required');
};
const mapIncident = (item: {
  incident_id: string;
  incident_code: string;
  title: string;
  category: string | null;
  severity: string;
  status: string;
  occurred_at: Date | null;
  detected_at: Date;
  created_at: Date;
  description?: string;
}) => ({
  id: item.incident_id,
  incidentCode: item.incident_code,
  title: item.title,
  ...(item.description !== undefined ? { description: item.description } : {}),
  category: item.category,
  severity: item.severity,
  status: item.status,
  occurredAt: item.occurred_at?.toISOString() ?? null,
  detectedAt: item.detected_at.toISOString(),
  createdAt: item.created_at.toISOString(),
});
export const incidentManagementService = {
  async report(
    input: ReportIncidentInput,
    actor: Actor,
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    requireReportPermission(actor);
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return mapIncident(
      await incidentManagementRepository.createReport(
        input,
        actor.userId,
        `INC-${date}-${randomUUID().slice(0, 8).toUpperCase()}`,
        context,
      ),
    );
  },
  async listMine(query: MyIncidentsQuery, actor: Actor) {
    requireReportPermission(actor);
    const result = await incidentManagementRepository.listOwnReports(actor.userId, query);
    return {
      items: result.items.map(mapIncident),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / query.limit)),
      },
    };
  },
  async getMine(incidentId: string, actor: Actor) {
    requireReportPermission(actor);
    const incident = await incidentManagementRepository.findOwnReport(incidentId, actor.userId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident report not found');
    return mapIncident(incident);
  },
} as const;
