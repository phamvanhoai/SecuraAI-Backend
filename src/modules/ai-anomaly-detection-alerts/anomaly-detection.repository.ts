import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { DetectionFeature } from './detection-model.js';
import { detectionSeverity } from './detection-model.js';
import { peakSnapshot } from './alert-score-snapshot.js';
import { detectionJobsRepository, pipelineEngine } from './detection-jobs.repository.js';
// Manual and durable workers use the same ML/LLM engine identity.
const engineVersion = pipelineEngine;

// Select only the event fields required by ML/LLM detection and its mapped Asset.
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
  // Load 60 past minutes; the ML client derives the 1/5/15/60-minute windows.
  async findMlTemporalContext(event: DetectionEvent) {
    //if dont have acount and ip then dont find history
    if (!event.account_identifier && !event.source_ip) return [];
    const relatedIdentities: Prisma.normalized_eventsWhereInput[] = [];
    if (event.account_identifier) {
      relatedIdentities.push({ account_identifier: event.account_identifier });
    }
    if (event.source_ip) {
      relatedIdentities.push({ source_ip: event.source_ip });
    }
    // Load same-source and same-family history linked by account or source IP.
    return prisma.normalized_events.findMany({
      where: {
        event_source_id: event.event_source_id,
        event_family: event.event_family,
        OR: relatedIdentities,
        occurred_at: {
          gte: new Date(event.occurred_at.getTime() - 60 * 60_000),
          lte: event.occurred_at,
        },
      },
      select: eventSelect,
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }], //increa
      take: 5001, //get row
    });
  },
  // Load the authenticated account fields required by service authorization.
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },
  // Load the newest deployed model and its detection parameters.
  findDeployedModel() {
    return prisma.ai_model_versions.findFirst({
      where: { status: 'DEPLOYED' },
      orderBy: [{ deployed_at: 'desc' }, { created_at: 'desc' }], //new to old
      select: { id: true, model_name: true, version: true, parameters: true },
    });
  },
  // Claim/query at most `take` events not processed by this model/engine.
  async findPendingEvents(modelVersionId: string, take: number, scope: PendingEventScope) {
    // Create missing durable jobs, claim one bounded batch and load its events.
    await detectionJobsRepository.discover(modelVersionId, scope);
    const claim = await detectionJobsRepository.claim(modelVersionId, take, 'DETECTION', scope);
    const ids = claim.jobs.flatMap((job) => (job.event_id ? [job.event_id] : []));
    const events = await prisma.normalized_events.findMany({
      where: { id: { in: ids } },
      select: eventSelect,
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
    });
    return { events, leaseToken: claim.token };
  },
  // Check whether another batch remains after the current run finishes.
  async hasPendingEvents(modelVersionId: string) {
    const rows = await prisma.$queryRaw<{ pending: boolean }[]>`SELECT EXISTS (
      SELECT 1 FROM detection_jobs j WHERE j.kind='DETECTION' AND j.model_version_id=${modelVersionId}::uuid
        AND j.engine_version=${pipelineEngine} AND j.status IN ('PENDING','PROCESSING')
      UNION ALL SELECT 1 FROM normalized_events e WHERE NOT EXISTS(SELECT 1 FROM anomaly_detections d WHERE d.event_id=e.id AND d.model_version_id=${modelVersionId}::uuid)
        AND NOT EXISTS(SELECT 1 FROM detection_jobs j WHERE j.event_id=e.id AND j.model_version_id=${modelVersionId}::uuid AND j.engine_version=${pipelineEngine})
    ) AS pending`;
    return rows[0]?.pending ?? false;
  },
  // Atomically save detections, evidence, grouped alerts, jobs and audit data.
  persistRun(input: {
    leaseToken?: string | undefined;
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
      outcome: 'BELOW_THRESHOLD' | 'LLM_BENIGN' | 'LLM_SUSPICIOUS' | 'MALICIOUS';
      groupKey: string;
      explanationText?: string;
      explanationGeneratedAt?: Date;
    }[];
    failures?: readonly {
      eventId: string;
      code: string;
      stage: 'ML_MODEL' | 'FOUNDATION_SEC';
      message: string;
    }[];
    summary: Prisma.InputJsonValue;
  }) {
    const failures = input.failures ?? [];
    // Only MALICIOUS detections are eligible to create or join alerts.
    const anomalyIds = input.detections.filter((item) => item.isAnomaly).map((item) => item.id);
    return prisma.$transaction(
      async (transaction) => {
        // Serializes duplicate runs across worker processes, not only this Node instance.
        // Cast PostgreSQL's void result so Prisma can deserialize the acquired lock.
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.modelVersionId}, 0))::text AS locked`;
        // Store the Generate Anomaly Score result and the threshold used for
        // each event. Scores are immutable; skipDuplicates makes retries idempotent.
        let created = { count: 0 };
        if (input.detections.length > 0) {
          created = await transaction.anomaly_detections.createMany({
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
        }
        if (input.leaseToken) {
          // Verify this worker still owns every claimed job before saving results.
          const owned = await transaction.$queryRaw<
            { id: string }[]
          >`SELECT id FROM detection_jobs WHERE lease_token=${input.leaseToken}::uuid AND status='PROCESSING' AND lease_until>now() FOR UPDATE`;
          if (owned.length !== input.detections.length + failures.length)
            throw new Error('Detection lease expired; discard stale results');
        }
        // Keep only persisted MALICIOUS detections that do not have an alert yet.
        let persistedAnomalies: { id: string }[] = [];
        if (anomalyIds.length > 0) {
          persistedAnomalies = await transaction.anomaly_detections.findMany({
            where: { id: { in: anomalyIds }, anomaly_alerts: null },
            select: { id: true },
          });
        }
        // Reload persisted IDs because duplicate detection retries may be skipped.
        let persisted: { id: string }[] = [];
        if (input.detections.length > 0) {
          persisted = await transaction.anomaly_detections.findMany({
            where: { id: { in: input.detections.map((item) => item.id) } },
            select: { id: true },
          });
        }
        const persistedIds = new Set(persisted.map((item) => item.id));
        // Convert each detection's ML/LLM evidence into database rows.
        const featureRows = input.detections
          .filter((item) => persistedIds.has(item.id))
          .flatMap((item) =>
            item.features.map((feature) => ({
              detection_id: item.id,
              feature_name: feature.featureName,
              feature_value: feature.featureValue,
              rank: feature.rank,
            })),
          );
        if (featureRows.length)
          await transaction.anomaly_feature_contributions.createMany({ data: featureRows });
        let alertsCreated = 0;
        let alertsGrouped = 0;
        // Cache alert groups found here and collect evidence added while grouping.
        const groups = new Map<string, { detection_id: string; occurredAt: Date }>();
        const lockedAlerts = new Set<string>();
        const groupedEvidence: Prisma.anomaly_feature_contributionsCreateManyInput[] = [];
        const persistedAnomalyIds = new Set(persistedAnomalies.map((item) => item.id));
        // Correlated anomalies within 15 minutes join an existing open alert.
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
          // Reuse an open alert with the same group from the last 15 minutes.
          let existing:
            | { detection_id: string; occurredAt: Date }
            | {
                detection_id: string;
                anomaly_detections: { normalized_events: { occurred_at: Date } };
              }
            | null = cached ?? null;
          const cachedAlertIsExpired =
            !cached || detection.occurredAt.getTime() - cached.occurredAt.getTime() > 15 * 60_000;
          if (cachedAlertIsExpired) {
            existing = await transaction.anomaly_alerts.findFirst({
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
          }
          if (existing && !lockedAlerts.has(existing.detection_id)) {
            // Lock the alert so concurrent workers cannot group into it together.
            const open = await transaction.$queryRaw<{ id: string }[]>`SELECT id FROM anomaly_alerts
              WHERE detection_id = ${existing.detection_id}::uuid AND status IN ('NEW', 'IN_TRIAGE', 'NEED_INVESTIGATION') FOR UPDATE`;
            if (open.length === 0) existing = null;
            else lockedAlerts.add(existing.detection_id);
          }
          if (existing) {
            // Stronger grouped evidence raises alert severity without rewriting detections.
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
            // Find the strongest score already recorded for this alert.
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
                    if (
                      typeof value === 'object' &&
                      value !== null &&
                      'score' in value &&
                      typeof value.score === 'number'
                    ) {
                      return value.score;
                    }
                    return 0;
                  } catch {
                    return 0;
                  }
                }),
            );
            if (detection.score > previousScore) {
              const updated = await transaction.$queryRaw<{ updated_at: Date }[]>`
                UPDATE anomaly_alerts
                SET severity = ${detectionSeverity(detection.score)},
                    updated_at = GREATEST(clock_timestamp(), created_at, updated_at)
                WHERE detection_id = ${existing.detection_id}::uuid
                  AND status IN ('NEW', 'IN_TRIAGE', 'NEED_INVESTIGATION')
                RETURNING updated_at`;
              const updatedAt = updated[0]?.updated_at;
              if (!updatedAt) throw new Error('Open alert changed during priority update');
              // Record why this event raised the grouped alert's score and severity.
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
            }
            // Link this detection to the existing alert as correlated evidence.
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
          // No open group exists, so this detection starts a new alert.
          await transaction.anomaly_alerts.create({
            data: {
              detection_id: id,
              // The UPDATE trigger uses transaction now(), while Prisma's
              // @updatedAt defaults use application time. Use the same clock
              // for creation so a later update in this transaction is valid.
              created_at:
                (await transaction.$queryRaw<{ time: Date }[]>`SELECT CURRENT_TIMESTAMP AS time`)[0]
                  ?.time ??
                (() => {
                  throw new Error('Database timestamp unavailable');
                })(),
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
        if (input.leaseToken) {
          // Complete durable jobs whose ML/LLM detection finished successfully.
          for (const item of input.detections) {
            await transaction.$executeRaw`UPDATE detection_jobs SET status='COMPLETED',result=${JSON.stringify({ score: item.score, isAnomaly: item.isAnomaly, outcome: item.outcome, detectionId: item.id })}::jsonb,
              lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=now()
              WHERE lease_token=${input.leaseToken}::uuid AND event_id=${item.eventId}::uuid`;
          }
          // Fail durable jobs whose required ML or LLM stage did not complete.
          for (const item of failures) {
            await transaction.$executeRaw`UPDATE detection_jobs SET status='FAILED',
              result=${JSON.stringify({ stage: item.stage, message: item.message, retryable: true })}::jsonb,
              lease_token=NULL,lease_until=NULL,error_code=${item.code},updated_at=now()
              WHERE lease_token=${input.leaseToken}::uuid AND event_id=${item.eventId}::uuid`;
          }
          // Queue later explanation enrichment for alerts from this batch.
          if (input.detections.length > 0)
            await transaction.$executeRaw`INSERT INTO detection_jobs(kind,alert_id,model_version_id,engine_version)
            SELECT 'EXPLANATION',a.id,${input.modelVersionId}::uuid,${pipelineEngine} FROM anomaly_alerts a JOIN anomaly_detections d ON d.id=a.detection_id
            WHERE d.id IN (${Prisma.join(input.detections.map((d) => Prisma.sql`${d.id}::uuid`))}) ON CONFLICT DO NOTHING`;
        }
        // Append the run summary to the hash-linked audit chain.
        const previous = await transaction.audit_logs.findFirst({
          orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
          select: { record_hash: true },
        });
        const scoreUpdates = groupedEvidence
          .filter((item) => item.feature_name === 'alert_score_update')
          .map((item) => ({
            originalDetectionId: item.detection_id,
            evidence: item.feature_value ?? '',
          }));
        let auditSummary: Prisma.InputJsonValue = input.summary;
        if (scoreUpdates.length > 0) {
          auditSummary = { run: input.summary, scoreUpdates };
        }
        // Hash this audit entry with the previous record so changes are detectable.
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
        // Store the actor, request context and final batch summary.
        let actorUserId: string | null = null;
        let source = 'SYSTEM';
        if (input.actor.type === 'USER') {
          actorUserId = input.actor.userId;
          source = 'API';
        }
        const auditData: Prisma.audit_logsUncheckedCreateInput = {
          actor_user_id: actorUserId,
          actor_type: input.actor.type,
          action: 'ANOMALY_DETECTION_RUN',
          resource_type: 'ANOMALY_DETECTION',
          source,
          source_ip: input.sourceIp ?? null,
          user_agent: input.userAgent ?? null,
          after_data: auditSummary,
          record_hash: recordHash,
        };
        if (input.correlationId) {
          auditData.correlation_id = input.correlationId;
        }
        if (previous) {
          auditData.previous_hash = previous.record_hash;
        }
        await transaction.audit_logs.create({
          data: auditData,
        });
        // Return the actual rows created or grouped after idempotency checks.
        return { detectionsCreated: created.count, alertsCreated, alertsGrouped };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 60_000 },
    );
  },
};
