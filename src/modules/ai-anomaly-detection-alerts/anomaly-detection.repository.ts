import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const eventSelect = { id: true, event_type: true, severity: true, occurred_at: true } as const;
export type DetectionEvent = Prisma.normalized_eventsGetPayload<{ select: typeof eventSelect }>;

export const anomalyDetectionRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },
  findDeployedModel() {
    return prisma.ai_model_versions.findFirst({
      where: { status: 'DEPLOYED' },
      orderBy: [{ deployed_at: 'desc' }, { created_at: 'desc' }],
      select: { id: true, model_name: true, version: true, parameters: true },
    });
  },
  async findPendingEvents(modelVersionId: string, since: Date, take: number) {
    const [events, frequencies] = await Promise.all([
      prisma.normalized_events.findMany({
        where: {
          occurred_at: { gte: since },
          anomaly_detections: { none: { model_version_id: modelVersionId } },
        },
        select: eventSelect,
        orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
        take,
      }),
      prisma.normalized_events.groupBy({
        by: ['event_type'],
        where: { occurred_at: { gte: since } },
        orderBy: { event_type: 'asc' },
        _count: { _all: true },
      }),
    ]);
    return {
      events,
      frequencies: new Map(frequencies.map((item) => [item.event_type, item._count._all])),
      populationSize: frequencies.reduce((total, item) => total + item._count._all, 0),
    };
  },
  persistRun(input: {
    actorUserId: string;
    modelVersionId: string;
    correlationId?: string;
    detections: readonly {
      id: string;
      eventId: string;
      score: number;
      threshold: number;
      isAnomaly: boolean;
    }[];
    summary: Prisma.InputJsonValue;
  }) {
    const anomalyIds = input.detections.filter((item) => item.isAnomaly).map((item) => item.id);
    return prisma.$transaction(
      async (transaction) => {
        const created = await transaction.anomaly_detections.createMany({
          data: input.detections.map((item) => ({
            id: item.id,
            event_id: item.eventId,
            model_version_id: input.modelVersionId,
            anomaly_score: item.score,
            threshold: item.threshold,
            is_anomaly: item.isAnomaly,
          })),
          skipDuplicates: true,
        });
        const persistedAnomalies = anomalyIds.length
          ? await transaction.anomaly_detections.findMany({
              where: { id: { in: anomalyIds }, anomaly_alerts: null },
              select: { id: true },
            })
          : [];
        const alerts = await transaction.anomaly_alerts.createMany({
          data: persistedAnomalies.map(({ id }) => ({ detection_id: id, severity: 'HIGH' })),
          skipDuplicates: true,
        });
        const previous = await transaction.audit_logs.findFirst({
          orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
          select: { record_hash: true },
        });
        const recordHash = createHash('sha256')
          .update(
            JSON.stringify({
              previousHash: previous?.record_hash ?? null,
              actorUserId: input.actorUserId,
              correlationId: input.correlationId,
              summary: input.summary,
            }),
          )
          .digest('hex');
        await transaction.audit_logs.create({
          data: {
            actor_user_id: input.actorUserId,
            actor_type: 'USER',
            action: 'ANOMALY_DETECTION_RUN',
            resource_type: 'ANOMALY_DETECTION',
            ...(input.correlationId ? { correlation_id: input.correlationId } : {}),
            source: 'API',
            after_data: input.summary,
            ...(previous ? { previous_hash: previous.record_hash } : {}),
            record_hash: recordHash,
          },
        });
        return { detectionsCreated: created.count, alertsCreated: alerts.count };
      },
      { isolationLevel: 'Serializable' },
    );
  },
};
