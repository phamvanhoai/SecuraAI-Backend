import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { DetectionFeature } from './detection-model.js';
import { detectionSeverity } from './detection-model.js';
import { peakSnapshot } from './alert-score-snapshot.js';
import { detectionJobsRepository, pipelineEngine } from './detection-jobs.repository.js';
// Manual and automatic runs use the same engine name. This stops the same
// event from being treated as new work by each run type.
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
  // Load up to 60 minutes of related events. The ML service uses this data to
  // build the 1, 5, 15 and 60-minute views.
  async findMlTemporalContext(event: DetectionEvent) {
    // Without an account or source IP, we cannot tell which past events belong
    // to the same user or connection.
    if (!event.account_identifier && !event.source_ip) return [];
    const relatedIdentities: Prisma.normalized_eventsWhereInput[] = [];
    if (event.account_identifier) {
      relatedIdentities.push({ account_identifier: event.account_identifier });
    }
    if (event.source_ip) {
      relatedIdentities.push({ source_ip: event.source_ip });
    }
    // Use only events from the same source and family, for the same account or
    // source IP. This avoids mixing unrelated activity.
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
      // Keep a fixed oldest-to-newest order when building time windows.
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      // Limit the amount of data loaded for a very active account or IP.
      take: 5001,
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
      // Use the latest deployed model. If deployment times match, use the
      // model created most recently.
      orderBy: [{ deployed_at: 'desc' }, { created_at: 'desc' }],
      select: { id: true, model_name: true, version: true, parameters: true },
    });
  },
  // Create missing jobs, give this worker at most `take` jobs for a limited
  // time, then load their events from oldest to newest.
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
  // Return true when jobs are still waiting or running, or when an event has
  // not been turned into a job for the current engine yet.
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
    // isAnomaly becomes true only when Foundation-Sec returns MALICIOUS. An ML
    // score above the threshold is not enough to create an alert.
    const anomalyIds = input.detections.filter((item) => item.isAnomaly).map((item) => item.id);
    return prisma.$transaction(
      async (transaction) => {
        // Let only one process save results for this model at a time. This
        // prevents two workers from creating the same alert.
        // PostgreSQL returns no value for this lock, so cast it to text for Prisma.
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
          // Make sure every job still belongs to this worker and is not expired.
          const owned = await transaction.$queryRaw<
            { id: string }[]
          >`SELECT id FROM detection_jobs WHERE lease_token=${input.leaseToken}::uuid AND status='PROCESSING' AND lease_until>now() FOR UPDATE`;
          if (owned.length !== input.detections.length + failures.length)
            throw new Error('Detection lease expired; discard stale results');
        }
        // Keep MALICIOUS detections that were saved but do not have an alert.
        // If the same batch runs again, it will not create a second alert.
        let persistedAnomalies: { id: string }[] = [];
        if (anomalyIds.length > 0) {
          persistedAnomalies = await transaction.anomaly_detections.findMany({
            where: { id: { in: anomalyIds }, anomaly_alerts: null },
            select: { id: true },
          });
        }
        // Reload saved IDs because createMany may skip rows from an earlier run.
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
        // Remember alert groups found in this batch, so the next matching
        // detection does not need another database search.
        const groups = new Map<string, { detection_id: string; occurredAt: Date }>();
        const lockedAlerts = new Set<string>();
        const groupedEvidence: Prisma.anomaly_feature_contributionsCreateManyInput[] = [];
        const persistedAnomalyIds = new Set(persistedAnomalies.map((item) => item.id));
        // Process MALICIOUS detections from oldest to newest. Detections with
        // the same group within 15 minutes can share one open alert.
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
          // First use a matching alert found in this batch. If none is recent
          // enough, search the database for an open alert from the last 15 minutes.
          let existing:
            | { detection_id: string; occurredAt: Date }
            | {
                detection_id: string;
                anomaly_detections: { normalized_events: { occurred_at: Date } };
              }
            | null = cached ?? null;
          const cachedAlertIsExpired =
            !cached || detection.occurredAt.getTime() - cached.occurredAt.getTime() > 15 * 60_000;
          // Find the newest open alert with the same group, model and engine within 15 minutes.
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
          // Lock an existing alert once before adding more detections to it.
          if (existing && !lockedAlerts.has(existing.detection_id)) {
            // Lock the alert only if it is still open, so other workers must wait.
            const open = await transaction.$queryRaw<{ id: string }[]>`SELECT id FROM anomaly_alerts
              WHERE detection_id = ${existing.detection_id}::uuid
                AND status IN ('NEW', 'IN_TRIAGE', 'NEED_INVESTIGATION')
              FOR UPDATE`;
            if (open.length === 0) existing = null;
            else lockedAlerts.add(existing.detection_id);
          }
          // Add the detection to the matching alert instead of creating a new one.
          if (existing) {
            // Load the alert's first score and any later score changes.
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
            // Find the highest score already connected to this alert.
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
            // Raise the alert priority only when the new score is stronger.
            if (detection.score > previousScore) {
              // Update only an open alert and keep its update time moving forward.
              const updated = await transaction.$queryRaw<{ updated_at: Date }[]>`
                UPDATE anomaly_alerts
                SET severity = ${detectionSeverity(detection.score)},
                    updated_at = GREATEST(clock_timestamp(), created_at, updated_at)
                WHERE detection_id = ${existing.detection_id}::uuid
                  AND status IN ('NEW', 'IN_TRIAGE', 'NEED_INVESTIGATION')
                RETURNING updated_at`;
              const updatedAt = updated[0]?.updated_at;
              // Stop when another change prevents the priority update.
              if (!updatedAt) throw new Error('Open alert changed during priority update');
              // Save the old and new scores so users can see why the alert changed.
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
            // Save this detection as another event that supports the same alert.
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
            // Copy database results into the simple in-memory group cache.
            if ('anomaly_detections' in existing)
              groups.set(detection.groupKey, {
                detection_id: existing.detection_id,
                occurredAt: existing.anomaly_detections.normalized_events.occurred_at,
              });
            alertsGrouped += 1;
            continue;
          }
          // No matching open alert was found, so create a new alert.
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
          // Mark jobs as completed when both required analysis steps finished.
          for (const item of input.detections) {
            await transaction.$executeRaw`UPDATE detection_jobs SET status='COMPLETED',result=${JSON.stringify({ score: item.score, isAnomaly: item.isAnomaly, outcome: item.outcome, detectionId: item.id })}::jsonb,
              lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=now()
              WHERE lease_token=${input.leaseToken}::uuid AND event_id=${item.eventId}::uuid`;
          }
          // Mark jobs as failed when ML or Foundation-Sec did not finish.
          for (const item of failures) {
            await transaction.$executeRaw`UPDATE detection_jobs SET status='FAILED',
              result=${JSON.stringify({ stage: item.stage, message: item.message, retryable: true })}::jsonb,
              lease_token=NULL,lease_until=NULL,error_code=${item.code},updated_at=now()
              WHERE lease_token=${input.leaseToken}::uuid AND event_id=${item.eventId}::uuid`;
          }
          // Queue optional Ollama explanation enrichment for alerts created by this batch.
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
