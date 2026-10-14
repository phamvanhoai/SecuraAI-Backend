import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { SaveIncidentAnalysis } from './dto/incident-analysis.dto.js';

const analysisSelect = {
  id: true,
  root_cause: true,
  lessons_learned: true,
  improvement_actions: true,
  analyzed_at: true,
  created_at: true,
  updated_at: true,
  users: { select: { id: true, full_name: true } },
} satisfies Prisma.incident_analysisSelect;
export type AnalysisRecord = Prisma.incident_analysisGetPayload<{ select: typeof analysisSelect }>;
export const incidentAnalysisRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  },
  findIncident(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { id: incidentId },
      select: { status: true, incident_analysis: { select: analysisSelect } },
    });
  },
  history(incidentId: string, page: number, limit: number) {
    const where = {
      resource_type: 'INCIDENT',
      resource_id: incidentId,
      action: 'INCIDENT_ANALYSIS_SAVED',
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
  save(userId: string, incidentId: string, input: SaveIncidentAnalysis) {
    return prisma.$transaction(
      async (tx) => {
        const actor = await tx.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.role !== 'SECURITY_OFFICER' || actor.status !== 'ACTIVE')
          return { outcome: 'forbidden' as const };
        await tx.$queryRaw`SELECT id FROM public.incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
        const incident = await tx.incidents.findUnique({
          where: { id: incidentId },
          select: { status: true, incident_analysis: { select: analysisSelect } },
        });
        if (!incident) return { outcome: 'not_found' as const };
        if (incident.status === 'CLOSED') return { outcome: 'closed' as const };
        if (incident.status !== 'LESSONS_LEARNED')
          return { outcome: 'not_ready' as const };
        const previous = incident.incident_analysis;
        if ((previous?.updated_at.toISOString() ?? null) !== input.expectedUpdatedAt)
          return { outcome: 'conflict' as const };
        const at = new Date();
        const after = {
          rootCause: input.rootCause,
          lessonsLearned: input.lessonsLearned,
          improvementActions: input.improvementActions,
        };
        const data = {
          root_cause: input.rootCause,
          lessons_learned: input.lessonsLearned,
          improvement_actions: input.improvementActions,
          analyzed_by: userId,
          analyzed_at: at,
          updated_at: at,
        };
        const analysis = await tx.incident_analysis.upsert({
          where: { incident_id: incidentId },
          create: { incident_id: incidentId, created_at: at, ...data },
          update: data,
          select: analysisSelect,
        });
        await tx.incidents.update({ where: { id: incidentId }, data: { updated_at: at } });
        const id = randomUUID();
        await tx.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            resource_type: 'INCIDENT',
            resource_id: incidentId,
            action: 'INCIDENT_ANALYSIS_SAVED',
            source: 'API',
            occurred_at: at,
            before_data: previous
              ? {
                  rootCause: previous.root_cause,
                  lessonsLearned: previous.lessons_learned,
                  improvementActions: previous.improvement_actions,
                }
              : Prisma.JsonNull,
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, userId, incidentId, at, after }))
              .digest('hex'),
          },
        });
        return { outcome: 'saved' as const, analysis };
      },
      { isolationLevel: 'Serializable' },
    );
  },
};
