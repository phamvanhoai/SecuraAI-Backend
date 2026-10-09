import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CloseIncident } from './dto/close-incident.dto.js';

const select = {
  status: true,
  updated_at: true,
  closed_at: true,
  incident_analysis: {
    select: { root_cause: true, lessons_learned: true, improvement_actions: true },
  },
} as const;
export function closureRestriction(incident: {
  status: string;
  incident_analysis: {
    root_cause: string | null;
    lessons_learned: string | null;
    improvement_actions: string | null;
  } | null;
}) {
  if (incident.status === 'CLOSED') return 'This incident is already closed.';
  if (incident.status !== 'LESSONS_LEARNED')
    return 'Complete verified recovery and move to Lessons learned before closing.';
  const findings = incident.incident_analysis;
  if (
    !findings?.root_cause?.trim() ||
    !findings.lessons_learned?.trim() ||
    !findings.improvement_actions?.trim()
  )
    return 'Save root cause, lessons learned and improvement recommendations before closing.';
  return null;
}
export const incidentClosureRepository = {
  actor(id: string) {
    return prisma.users.findUnique({ where: { id }, select: { role: true, status: true } });
  },
  incident(id: string) {
    return prisma.incidents.findUnique({ where: { id }, select });
  },
  record(id: string) {
    return prisma.audit_logs.findFirst({
      where: {
        resource_type: 'INCIDENT',
        resource_id: id,
        action: 'INCIDENT_CLOSED',
        outcome: 'SUCCESS',
      },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        occurred_at: true,
        after_data: true,
        users: { select: { id: true, full_name: true } },
      },
    });
  },
  close(userId: string, incidentId: string, input: CloseIncident) {
    return prisma.$transaction(
      async (tx) => {
        const actor = await tx.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.role !== 'SECURITY_OFFICER' || actor.status !== 'ACTIVE')
          throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
        await tx.$queryRaw`SELECT id FROM public.incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
        const incident = await tx.incidents.findUnique({ where: { id: incidentId }, select });
        if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
        // Retrying a completed closure must never rewrite its time or audit record.
        if (incident.status === 'CLOSED') return { changed: false, closedAt: incident.closed_at };
        if (incident.updated_at.getTime() !== new Date(input.expectedUpdatedAt).getTime())
          throw new AppError(
            409,
            'INCIDENT_STALE',
            'Incident changed. Reload and review before closing.',
          );
        const restriction = closureRestriction(incident);
        if (restriction) throw new AppError(409, 'INCIDENT_NOT_READY_TO_CLOSE', restriction);
        const at = new Date();
        await tx.incidents.update({
          where: { id: incidentId },
          data: { status: 'CLOSED', closed_at: at, updated_at: at },
        });
        const id = randomUUID();
        const before = { status: incident.status, closedAt: incident.closed_at };
        const after = {
          status: 'CLOSED',
          closedAt: at.toISOString(),
          summary: input.summary,
          confirmed: true,
        };
        await tx.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            resource_type: 'INCIDENT',
            resource_id: incidentId,
            action: 'INCIDENT_CLOSED',
            source: 'API',
            occurred_at: at,
            before_data: before,
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, userId, incidentId, at, before, after }))
              .digest('hex'),
          },
        });
        return { changed: true, closedAt: at };
      },
      { isolationLevel: 'Serializable' },
    );
  },
};
