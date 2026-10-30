import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import type { RunAnomalyDetectionBody } from './dto/run-anomaly-detection.dto.js';
import { anomalyDetectionRepository } from './anomaly-detection.repository.js';
import {
  detectionPolicySchema,
  evaluateContext,
  detectionSeverity,
} from './contextual-detection.js';
import { env } from '../../config/env.js';
import { detectionJobsRepository, pipelineEngine } from './detection-jobs.repository.js';
import { generateStoredAlertExplanation } from './alert-explanation.generator.js';

const parametersSchema = z
  .object({
    threshold: z.number().min(0.5).max(1).default(0.8),
    detectionPolicy: detectionPolicySchema.default(() => detectionPolicySchema.parse({})),
    weights: z
      .object({
        severity: z.number().min(0).max(1),
        rarity: z.number().min(0).max(1),
        offHours: z.number().min(0).max(1),
      })
      .default({ severity: 0.45, rarity: 0.35, offHours: 0.2 }),
    assetThresholds: z
      .record(
        z.string(),
        z.object({ threshold: z.number().min(0.01).max(1), enabled: z.boolean() }).passthrough(),
      )
      .default({}),
  })
  .passthrough();
let detectionQueue: Promise<void> = Promise.resolve();

async function withDetectionLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = detectionQueue;
  let release = (): void => undefined;
  detectionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export const anomalyDetectionService = {
  async run(
    userId: string,
    input: RunAnomalyDetectionBody,
    correlationId?: string,
    context?: { sourceIp?: string | undefined; userAgent?: string | undefined },
  ) {
    const actor = await anomalyDetectionRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const model = await anomalyDetectionRepository.findDeployedModel();
    if (!model)
      throw new AppError(
        409,
        'NO_DEPLOYED_MODEL',
        'Deploy an anomaly detection model before running detection',
      );
    const audit = {
      actor: { type: 'USER' as const, userId },
      ...(correlationId ? { correlationId } : {}),
      ...(context?.sourceIp ? { sourceIp: context.sourceIp } : {}),
      ...(context?.userAgent ? { userAgent: context.userAgent } : {}),
    };
    return withDetectionLock(async () => {
      const result = await runDetection(
        model,
        { lookbackHours: null, maxEvents: input.maxEvents, eventScope: 'ALL' },
        audit,
      );
      const hasMore = await anomalyDetectionRepository.hasPendingEvents(model.id);
      return {
        ...result,
        lookbackHours: input.lookbackHours,
        scope: 'ALL_PENDING' as const,
        hasMore,
      };
    });
  },
  async runAutomated(input: Pick<RunAnomalyDetectionBody, 'maxEvents'>) {
    const model = await anomalyDetectionRepository.findDeployedModel();
    if (!model) return null;
    return withDetectionLock(() =>
      runDetection(
        model,
        { lookbackHours: null, maxEvents: input.maxEvents, eventScope: 'WAZUH_REALTIME' },
        { actor: { type: 'SYSTEM' } },
      ),
    );
  },
};

async function runDetection(
  model: Awaited<ReturnType<typeof anomalyDetectionRepository.findDeployedModel>> & {},
  input: {
    lookbackHours: number | null;
    maxEvents: number;
    eventScope: 'ALL' | 'WAZUH_REALTIME';
  },
  audit: {
    actor: { type: 'USER'; userId: string } | { type: 'SYSTEM' };
    correlationId?: string | undefined;
    sourceIp?: string | undefined;
    userAgent?: string | undefined;
  },
) {
  const parsed = parametersSchema.safeParse(model.parameters ?? {});
  if (!parsed.success)
    throw new AppError(
      409,
      'INVALID_DETECTION_CONFIGURATION',
      'The deployed detection configuration is invalid. Check its timezone, working hours and rule thresholds.',
    );
  const parameters = parsed.data;
  const since =
    input.lookbackHours === null ? null : new Date(Date.now() - input.lookbackHours * 3_600_000);
  const batch = await anomalyDetectionRepository.findPendingEvents(
    model.id,
    since,
    input.maxEvents,
    input.eventScope,
  );
  try {
    const detectedAt = new Date();
    const explanations = new Map<string, Promise<string>>();
    // One shared deadline for optional prose across the entire batch, not a
    // separate 60-second wait for every alert. Explicit regeneration is unchanged.
    const explanationDeadline = Date.now() + 5_000;
    const detections = [];
    // Bound DB/LLM concurrency; every event uses its own event-time history including previously evaluated events.
    for (let offset = 0; offset < batch.events.length; offset += 4) {
      detections.push(
        ...(await Promise.all(
          batch.events.slice(offset, offset + 4).map(async (event) => {
            const context = await anomalyDetectionRepository.findEventContext(event);
            let decision = evaluateContext(
              event,
              context.events,
              context.truncated,
              parameters.detectionPolicy,
              parameters.weights,
            );
            if (!decision.baselineReady && env.DETECTION_PIPELINE_ENABLED) {
              const peers = await anomalyDetectionRepository.findPeerContext(event);
              decision = evaluateContext(
                event,
                peers.events,
                peers.truncated,
                parameters.detectionPolicy,
                parameters.weights,
                true,
              );
            }
            const score = decision.score;
            const assetId = event.event_entity_mappings[0]?.asset_id;
            const customThreshold = assetId ? parameters.assetThresholds[assetId] : undefined;
            const configuredThresholdSource = customThreshold?.enabled
              ? 'ASSET_OVERRIDE'
              : 'MODEL_DEFAULT';
            const thresholdSource = configuredThresholdSource;
            const threshold = customThreshold?.enabled
              ? customThreshold.threshold
              : parameters.threshold;
            const isAnomaly = decision.baselineReady && score >= threshold;
            decision.features.push({
              featureName: 'configured_threshold',
              featureValue: JSON.stringify({ threshold, source: configuredThresholdSource }),
              contributionScore: 0,
              rank: decision.features.length + 1,
            });
            const explanationKey = `${decision.groupKey}:${Math.floor(event.occurred_at.getTime() / (15 * 60_000))}`;
            if (isAnomaly && !explanations.has(explanationKey))
              explanations.set(
                explanationKey,
                generateStoredAlertExplanation(
                  {
                    anomalyScore: score,
                    threshold,
                    suggestedRiskLevel: detectionSeverity(score).toLowerCase(),
                    detectedAt,
                    featureContributions: decision.features,
                    eventId: event.id,
                  },
                  {
                    timeoutMs: env.DETECTION_PIPELINE_ENABLED
                      ? 0
                      : Math.max(0, explanationDeadline - Date.now()),
                  },
                ),
              );
            const explanationText = isAnomaly ? await explanations.get(explanationKey) : undefined;
            return {
              id: randomUUID(),
              eventId: event.id,
              score,
              baselineReady: decision.baselineReady,
              threshold,
              thresholdSource,
              isAnomaly,
              occurredAt: event.occurred_at,
              features: decision.features,
              groupKey: decision.groupKey,
              ...(explanationText ? { explanationText, explanationGeneratedAt: detectedAt } : {}),
            };
          }),
        )),
      );
    }
    const summary = {
      modelVersionId: model.id,
      modelName: model.model_name,
      modelVersion: model.version,
      lookbackHours: input.lookbackHours,
      scope:
        input.eventScope === 'WAZUH_REALTIME'
          ? 'WAZUH_REALTIME'
          : input.lookbackHours === null
            ? 'ALL_PENDING'
            : 'LOOKBACK_WINDOW',
      eventsEvaluated: detections.length,
      anomaliesDetected: detections.filter((item) => item.isAnomaly).length,
      insufficientBaseline: detections.filter((item) => !item.baselineReady).length,
      engineVersion: env.DETECTION_PIPELINE_ENABLED ? pipelineEngine : 'contextual-rules-v1',
      timeZone: parameters.detectionPolicy.timeZone,
      customThresholdsApplied: detections.filter((item) => item.threshold !== parameters.threshold)
        .length,
    } satisfies Prisma.InputJsonObject;
    if (detections.length === 0) {
      return {
        ...summary,
        detectionsCreated: 0,
        alertsCreated: 0,
        threshold: parameters.threshold,
        completedAt: new Date().toISOString(),
      };
    }
    const persisted = await anomalyDetectionRepository.persistRun({
      actor: audit.actor,
      modelVersionId: model.id,
      leaseToken: batch.leaseToken,
      ...(audit.correlationId ? { correlationId: audit.correlationId } : {}),
      detections,
      summary,
      sourceIp: audit.sourceIp,
      userAgent: audit.userAgent,
    });
    return {
      ...summary,
      ...persisted,
      threshold: parameters.threshold,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (batch.leaseToken) await detectionJobsRepository.fail(batch.leaseToken);
    throw error;
  }
}
