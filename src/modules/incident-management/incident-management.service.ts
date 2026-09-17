import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import type {
  ClassificationQueueQuery,
  ClassifyIncidentInput,
  MyIncidentsQuery,
  ReportIncidentInput,
} from './dto/report-incident.dto.js';
import { incidentManagementRepository } from './incident-management.repository.js';
type Actor = { userId: string; permissions: readonly string[] };
const requireReportPermission = (actor: Actor) => {
  if (!actor.permissions.includes('incidents.report'))
    throw new AppError(403, 'FORBIDDEN', 'Incident reporting permission required');
};
const requireClassifyPermission = (actor: Actor) => {
  if (!actor.permissions.includes('incidents.classify'))
    throw new AppError(403, 'FORBIDDEN', 'Incident classification permission required');
};
type ClassificationSummary = {
  count: number;
  classifiedAt: string;
  classifiedBy: { id: string; name: string } | null;
  rationale: string | null;
};
const jsonString = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : null;
};
const mapIncident = (
  item: {
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
  },
  classification?: ClassificationSummary,
) => ({
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
  classified: Boolean(classification),
  classificationCount: classification?.count ?? 0,
  lastClassification: classification
    ? {
        classifiedAt: classification.classifiedAt,
        classifiedBy: classification.classifiedBy,
        rationale: classification.rationale,
      }
    : null,
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
      items: result.items.map((item) => mapIncident(item)),
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
  async listForClassification(query: ClassificationQueueQuery, actor: Actor) {
    requireClassifyPermission(actor);
    const result = await incidentManagementRepository.listClassificationQueue(query);
    const summaries = new Map<string, ClassificationSummary>();
    for (const audit of result.classificationAudits) {
      if (!audit.entity_id) continue;
      const existing = summaries.get(audit.entity_id);
      if (existing) {
        existing.count += 1;
        continue;
      }
      summaries.set(audit.entity_id, {
        count: 1,
        classifiedAt: audit.created_at.toISOString(),
        classifiedBy: audit.users ? { id: audit.users.user_id, name: audit.users.full_name } : null,
        rationale: jsonString(audit.after_data, 'rationale'),
      });
    }
    return {
      items: result.items.map((item) => mapIncident(item, summaries.get(item.incident_id))),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / query.limit)),
      },
    };
  },
  async classify(
    incidentId: string,
    input: ClassifyIncidentInput,
    actor: Actor,
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    requireClassifyPermission(actor);
    const result = await incidentManagementRepository.classifySeverity(
      incidentId,
      input,
      actor.userId,
      context,
    );
    if (result.outcome === 'not_found')
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    if (result.outcome === 'closed')
      throw new AppError(409, 'INCIDENT_CLOSED', 'Closed incidents cannot be reclassified');
    return mapIncident(result.incident);
  },
} as const;
