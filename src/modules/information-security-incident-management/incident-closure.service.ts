import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { closureSnapshotSchema, type CloseIncident } from './dto/close-incident.dto.js';
import { closureRestriction, incidentClosureRepository } from './incident-closure.repository.js';

async function viewer(userId: string) {
  const actor = await incidentClosureRepository.actor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Active account required');
  if (!['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role))
    throw new AppError(403, 'FORBIDDEN', 'Incident viewing permission required');
  return actor;
}
export const incidentClosureService = {
  async current(userId: string, incidentId: string) {
    const actor = await viewer(userId);
    const incident = await incidentClosureRepository.incident(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const restriction =
      actor.role !== 'SECURITY_OFFICER'
        ? 'Only Security Officers can close incidents.'
        : closureRestriction(incident);
    const record = await incidentClosureRepository.record(incidentId);
    const snapshot = closureSnapshotSchema.safeParse(record?.after_data);
    return {
      status: incident.status.toLowerCase(),
      expectedUpdatedAt: incident.updated_at,
      closedAt: incident.closed_at,
      canClose: restriction === null,
      restriction,
      closure: record
        ? {
            id: record.id,
            recordedAt: record.occurred_at,
            closedBy: record.users ? { id: record.users.id, name: record.users.full_name } : null,
            summary: snapshot.success ? snapshot.data.summary : null,
          }
        : null,
    };
  },
  async close(userId: string, incidentId: string, input: CloseIncident) {
    const actor = await viewer(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer required');
    try {
      return await incidentClosureRepository.close(userId, incidentId, input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'INCIDENT_STALE',
          'Incident changed. Reload and review before closing.',
        );
      throw error;
    }
  },
};
