import { createHash, randomUUID } from 'node:crypto';
import type { incident_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { incidentViewSelect } from './incidents.repository.js';
import { validatePhaseTransition } from './incident-workflow.js';
import type { IncidentProgress } from './dto/incident-progress.dto.js';

const statuses = {
  triage: 'TRIAGE',
  containment: 'CONTAINMENT',
  eradication: 'ERADICATION',
  recovery: 'RECOVERY',
  lessons_learned: 'LESSONS_LEARNED',
} as const;
export const incidentProgressRepository = {
  update(userId: string, incidentId: string, input: IncidentProgress) {
    return prisma.$transaction(
      async (tx) => {
        const actor = await tx.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'SECURITY_OFFICER')
          throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
        await tx.$queryRaw`SELECT id FROM public.incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
        const incident = await tx.incidents.findUnique({
          where: { id: incidentId },
          select: { status: true, updated_at: true },
        });
        if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
        if (
          incident.status.toLowerCase() !== input.expectedStatus ||
          incident.updated_at.getTime() !== new Date(input.expectedUpdatedAt).getTime()
        )
          throw new AppError(
            409,
            'INCIDENT_STALE',
            'The incident changed. Refresh and review its current phase',
          );
        const target: incident_status = statuses[input.status];
        const skippedPhases = validatePhaseTransition(incident.status, target, input.skipReason);
        // Notes are an accountable officer's assessment, not automated proof of
        // task completion. An action count cannot establish response readiness.
        const at = new Date();
        const updated = await tx.incidents.update({
          where: { id: incidentId },
          data: { status: target, updated_at: at },
          select: incidentViewSelect,
        });
        const id = randomUUID();
        const before = { status: incident.status };
        const after = {
          status: target,
          note: input.note,
          confirmed: true,
          skipReason: input.skipReason ?? null,
          skippedPhases: [...skippedPhases],
          currentPhaseCompleted: target === 'LESSONS_LEARNED' || !input.skipReason,
          recoveryVerified: target === 'LESSONS_LEARNED',
        };
        await tx.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            resource_type: 'INCIDENT',
            resource_id: incidentId,
            action: 'INCIDENT_PHASE_CHANGED',
            source: 'API',
            occurred_at: at,
            before_data: before,
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, userId, incidentId, at, before, after }))
              .digest('hex'),
          },
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
  },
  history(incidentId: string, page: number, limit: number) {
    const where = {
      resource_type: 'INCIDENT',
      resource_id: incidentId,
      action: 'INCIDENT_PHASE_CHANGED',
      outcome: 'SUCCESS' as const,
    };
    return prisma.$transaction([
      prisma.audit_logs.count({ where }),
      prisma.audit_logs.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          occurred_at: true,
          before_data: true,
          after_data: true,
          users: { select: { id: true, full_name: true } },
        },
      }),
    ]);
  },
};
