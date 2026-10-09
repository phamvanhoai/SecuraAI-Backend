import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { analysisSnapshotSchema, type SaveIncidentAnalysis } from './dto/incident-analysis.dto.js';
import { incidentAnalysisRepository, type AnalysisRecord } from './incident-analysis.repository.js';

async function requireViewer(userId: string) {
  const actor = await incidentAnalysisRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Active account required');
  if (!['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role))
    throw new AppError(403, 'FORBIDDEN', 'Incident viewing permission required');
  return actor;
}
function mapAnalysis(record: AnalysisRecord) {
  return {
    id: record.id,
    rootCause: record.root_cause,
    lessonsLearned: record.lessons_learned,
    improvementActions: record.improvement_actions,
    analyzedAt: record.analyzed_at,
    updatedAt: record.updated_at,
    createdAt: record.created_at,
    analyzedBy: { id: record.users.id, name: record.users.full_name },
  };
}
export const incidentAnalysisService = {
  async current(userId: string, incidentId: string) {
    const actor = await requireViewer(userId);
    const incident = await incidentAnalysisRepository.findIncident(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const canEdit =
      actor.role === 'SECURITY_OFFICER' && ['LESSONS_LEARNED', 'CLOSED'].includes(incident.status);
    return {
      analysis: incident.incident_analysis ? mapAnalysis(incident.incident_analysis) : null,
      canEdit,
      editRestriction: canEdit
        ? null
        : actor.role !== 'SECURITY_OFFICER'
          ? 'Only Security Officers can document findings.'
          : 'Findings can be saved when the incident reaches Lessons learned or Closed.',
    };
  },
  async history(userId: string, incidentId: string, query: { page: number; limit: number }) {
    await requireViewer(userId);
    if (!(await incidentAnalysisRepository.findIncident(incidentId)))
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const [total, records] = await incidentAnalysisRepository.history(
      incidentId,
      query.page,
      query.limit,
    );
    return {
      items: records.map((record) => {
        const before = analysisSnapshotSchema.safeParse(record.before_data);
        const after = analysisSnapshotSchema.safeParse(record.after_data);
        return {
          id: record.id,
          savedAt: record.occurred_at,
          savedBy: record.users ? { id: record.users.id, name: record.users.full_name } : null,
          before: before.success ? before.data : null,
          findings: after.success ? after.data : null,
        };
      }),
      pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) },
    };
  },
  async save(userId: string, incidentId: string, input: SaveIncidentAnalysis) {
    const actor = await requireViewer(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    try {
      const result = await incidentAnalysisRepository.save(userId, incidentId, input);
      if (result.outcome === 'forbidden')
        throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
      if (result.outcome === 'not_found')
        throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
      if (result.outcome === 'not_ready')
        throw new AppError(
          409,
          'INCIDENT_NOT_READY_FOR_ANALYSIS',
          'Move the incident to Lessons learned or Closed after response is complete.',
        );
      if (result.outcome === 'conflict')
        throw new AppError(
          409,
          'INCIDENT_ANALYSIS_STALE',
          'Findings changed. Reload the latest findings before saving.',
        );
      return mapAnalysis(result.analysis);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'INCIDENT_ANALYSIS_STALE',
          'Findings changed. Reload the latest findings before saving.',
        );
      throw error;
    }
  },
};
