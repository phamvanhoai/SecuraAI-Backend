import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { DetectionFeature } from './contextual-detection.js';
import { detectionSeverity } from './contextual-detection.js';
import { peakSnapshot } from './alert-score-snapshot.js';
const engineVersion = 'contextual-rules-v1';

const eventSelect = {
  id: true,
  event_source_id: true,
  event_family: true,
  account_identifier: true,
  source_ip: true,
  device_identifier: true,
  normalized_payload: true,
  event_type: true,
  severity: true,
  occurred_at: true,
  event_entity_mappings: {
    where: { is_active: true, asset_id: { not: null } },
    orderBy: { mapped_at: 'desc' as const },
    take: 1,
    select: { asset_id: true },
  },
} as const;
export type DetectionEvent = Prisma.normalized_eventsGetPayload<{ select: typeof eventSelect }>;
export type PendingEventScope = 'ALL' | 'WAZUH_REALTIME';

export const anomalyDetectionRepository = {
  async findEventContext(event: DetectionEvent) {
    if (!event.account_identifier && !event.source_ip) return { events: [], truncated: false };
    const events = await prisma.normalized_events.findMany({
      where: {
        event_source_id: event.event_source_id,
        ...(event.account_identifier
          ? { account_identifier: event.account_identifier }
          : { source_ip: event.source_ip }),
        occurred_at: {
          gte: new Date(event.occurred_at.getTime() - 7 * 86_400_000),
          lte: event.occurred_at,
        },
      },
      select: eventSelect,
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      take: 5001,
    });
    return { events: events.slice(0, 5000), truncated: events.length > 5000 };
  },
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
  async findPendingEvents(
    modelVersionId: string,
    since: Date | null,
    take: number,
    scope: PendingEventScope,
  ) {
    const timeWindow = since ? { occurred_at: { gte: since } } : {};
    const sourceScope: Prisma.normalized_eventsWhereInput =
      scope === 'WAZUH_REALTIME'
        ? {
            ingestion_batch_id: null,
            event_sources: { source_type: 'WAZUH', ingestion_method: 'API' },
          }
        : {};
    const events = await prisma.normalized_events.findMany({
      where: {
        ...timeWindow,
        ...sourceScope,
        anomaly_detections: {
          none: { model_version_id: modelVersionId, engine_version: engineVersion },
        },
      },
      select: eventSelect,
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      take,
    });
    return { events };
  },
  async hasPendingEvents(modelVersionId: string) {
    const pending = await prisma.normalized_events.findFirst({
      where: {
        anomaly_detections: {
          none: { model_version_id: modelVersionId, engine_version: engineVersion },
        },
      },
      select: { id: true },
    });
    return pending !== null;
  },
  persistRun(input: {
    actor: { type: 'USER'; userId: string } | { type: 'SYSTEM' };
    modelVersionId: string;
    correlationId?: string | undefined;
    sourceIp?: string | undefined;
    userAgent?: string | undefined;
    detections: readonly {
      id: string;
      eventId: string;
      score: number;
      threshold: number;
      thresholdSource: string;
      isAnomaly: boolean;
      occurredAt: Date;
      features: DetectionFeature[];
      groupKey: string;
      explanationText?: string;
      explanationGeneratedAt?: Date;
    }[];
    summary: Prisma.InputJsonValue;
  }) {
    const anomalyIds = input.detections.filter((item) => item.isAnomaly).map((item) => item.id);
    return prisma.$transaction(
      async (transaction) => {
        // Serializes duplicate runs across worker processes, not only this Node instance.
        // Cast PostgreSQL's void result so Prisma can deserialize the acquired lock.
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.modelVersionId}, 0))::text AS locked`;
        const created = await transaction.anomaly_detections.createMany({
          data: input.detections.map((item) => ({
            id: item.id,
            event_id: item.eventId,
            model_version_id: input.modelVersionId,
            engine_version: engineVersion,
            anomaly_score: item.score,
            threshold: item.threshold,
            threshold_source: item.thresholdSource,
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
        const persisted = await transaction.anomaly_detections.findMany({
          where: { id: { in: input.detections.map((item) => item.id) } },
          select: { id: true },
        });
        const persistedIds = new Set(persisted.map((item) => item.id));
        await transaction.anomaly_feature_contributions.createMany({
          data: input.detections
            .filter((item) => persistedIds.has(item.id))
            .flatMap((item) =>
              item.features.map((feature) => ({
                detection_id: item.id,
                feature_name: feature.featureName,
                feature_value: feature.featureValue,
                contribution_score: feature.contributionScore,
                rank: feature.rank,
              })),
            ),
        });
        let alertsCreated = 0;
        let alertsGrouped = 0;
        const groups = new Map<string, { detection_id: string; occurredAt: Date }>();
        const lockedAlerts = new Set<string>();
        const groupedEvidence: Prisma.anomaly_feature_contributionsCreateManyInput[] = [];
        const persistedAnomalyIds = new Set(persistedAnomalies.map((item) => item.id));
        for (const { id } of input.detections
          .filter((item) => persistedAnomalyIds.has(item.id))
          .sort(
            (a, b) =>
              a.occurredAt.getTime() - b.occurredAt.getTime() || a.eventId.localeCompare(b.eventId),
          )) {
          const detection = input.detections.find((item) => item.id === id);
          if (!detection?.explanationText || !detection.explanationGeneratedAt) {
            throw new Error(`Missing stored explanation for anomaly detection ${id}`);
          }
          const cached = groups.get(detection.groupKey);
          let existing =
            cached && detection.occurredAt.getTime() - cached.occurredAt.getTime() <= 15 * 60_000
              ? cached
              : await transaction.anomaly_alerts.findFirst({
                  where: {
                    status: { in: ['NEW', 'IN_TRIAGE', 'NEED_INVESTIGATION'] },
                    anomaly_detections: {
                      model_version_id: input.modelVersionId,
                      engine_version: engineVersion,
                      normalized_events: {
                        occurred_at: {
                          gte: new Date(detection.occurredAt.getTime() - 15 * 60_000),
                          lte: detection.occurredAt,
                        },
                      },
                      anomaly_feature_contributions: {
                        some: {
                          feature_name: 'detection_group',
                          feature_value: JSON.stringify(detection.groupKey),
                        },
                      },
                    },
                  },
                  select: {
                    detection_id: true,
                    anomaly_detections: {
                      select: { normalized_events: { select: { occurred_at: true } } },
                    },
                  },
                  orderBy: { generated_at: 'desc' },
                });
          if (existing && !lockedAlerts.has(existing.detection_id)) {
            const open = await transaction.$queryRaw<{ id: string }[]>`SELECT id FROM anomaly_alerts
              WHERE detection_id = ${existing.detection_id}::uuid AND status IN ('NEW', 'IN_TRIAGE', 'NEED_INVESTIGATION') FOR UPDATE`;
            if (open.length === 0) existing = null;
            else lockedAlerts.add(existing.detection_id);
          }
          if (existing) {
            const original = await transaction.anomaly_detections.findUniqueOrThrow({
              where: { id: existing.detection_id },
              select: {
                anomaly_score: true,
                anomaly_feature_contributions: {
                  where: { feature_name: 'alert_score_update' },
                  select: { feature_name: true, feature_value: true },
                },
              },
            });
            const previousScore = Math.max(
              original.anomaly_score.toNumber(),
              peakSnapshot(
                original.anomaly_feature_contributions,
                original.anomaly_score.toNumber(),
              )?.score ?? 0,
              ...groupedEvidence
                .filter(
                  (item) =>
                    item.detection_id === existing.detection_id &&
                    item.feature_name === 'alert_score_update',
                )
                .map((item) => {
                  try {
                    const value: unknown = JSON.parse(item.feature_value ?? 'null');
                    return typeof value === 'object' &&
                      value !== null &&
                      'score' in value &&
                      typeof value.score === 'number'
                      ? value.score
                      : 0;
                  } catch {
                    return 0;
                  }
                }),
            );
            if (detection.score > previousScore) {
              const updatedAt = new Date();
              groupedEvidence.push({
                detection_id: existing.detection_id,
                feature_name: 'alert_score_update',
                rank: 101,
                feature_value: JSON.stringify({
                  previousScore,
                  score: detection.score,
                  threshold: detection.threshold,
                  detectionId: id,
                  eventId: detection.eventId,
                  occurredAt: detection.occurredAt.toISOString(),
                  updatedAt: updatedAt.toISOString(),
                  actor: 'SYSTEM',
                  reason: 'Stronger correlated event evidence',
                  features: detection.features,
                }),
              });
              await transaction.anomaly_alerts.updateMany({
                where: {
                  detection_id: existing.detection_id,
                  status: { in: ['NEW', 'IN_TRIAGE', 'NEED_INVESTIGATION'] },
                },
                data: { severity: detectionSeverity(detection.score), updated_at: updatedAt },
              });
            }
            groupedEvidence.push({
              detection_id: existing.detection_id,
              feature_name: 'correlated_detection',
              feature_value: JSON.stringify({
                detectionId: id,
                eventId: detection.eventId,
                occurredAt: detection.occurredAt.toISOString(),
                score: detection.score,
              }),
              rank: 100,
            });
            if ('anomaly_detections' in existing)
              groups.set(detection.groupKey, {
                detection_id: existing.detection_id,
                occurredAt: existing.anomaly_detections.normalized_events.occurred_at,
              });
            alertsGrouped += 1;
            continue;
          }
          await transaction.anomaly_alerts.create({
            data: {
              detection_id: id,
              severity: detectionSeverity(detection.score),
              explanation_text: detection.explanationText,
              explanation_generated_at: detection.explanationGeneratedAt,
            },
          });
          groups.set(detection.groupKey, { detection_id: id, occurredAt: detection.occurredAt });
          lockedAlerts.add(id);
          alertsCreated += 1;
        }
        if (groupedEvidence.length)
          await transaction.anomaly_feature_contributions.createMany({ data: groupedEvidence });
        const previous = await transaction.audit_logs.findFirst({
          orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
          select: { record_hash: true },
        });
        const scoreUpdates = groupedEvidence.filter((item) => item.feature_name === 'alert_score_update').map((item) => ({ originalDetectionId: item.detection_id, evidence: item.feature_value ?? '' }));
        const auditSummary: Prisma.InputJsonValue = scoreUpdates.length ? { run: input.summary, scoreUpdates } : input.summary;
        const recordHash = createHash('sha256')
          .update(
            JSON.stringify({
              previousHash: previous?.record_hash ?? null,
              actor: input.actor,
              correlationId: input.correlationId,
              summary: auditSummary,
            }),
          )
          .digest('hex');
        await transaction.audit_logs.create({
          data: {
            actor_user_id: input.actor.type === 'USER' ? input.actor.userId : null,
            actor_type: input.actor.type,
            action: 'ANOMALY_DETECTION_RUN',
            resource_type: 'ANOMALY_DETECTION',
            ...(input.correlationId ? { correlation_id: input.correlationId } : {}),
            source: input.actor.type === 'USER' ? 'API' : 'SYSTEM',
            source_ip: input.sourceIp ?? null,
            user_agent: input.userAgent ?? null,
            after_data: auditSummary,
            ...(previous ? { previous_hash: previous.record_hash } : {}),
            record_hash: recordHash,
          },
        });
        return { detectionsCreated: created.count, alertsCreated, alertsGrouped };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 60_000 },
    );
  },
};
