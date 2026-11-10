import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import type { RunAnomalyDetectionBody } from './dto/run-anomaly-detection.dto.js';
import { anomalyDetectionRepository } from './anomaly-detection.repository.js';
import {
  detectionPolicySchema,
  evaluateContext,
  detectionSeverity,
  type ContextEvent,
  type ContextualDecision,
} from './contextual-detection.js';
import { env } from '../../config/env.js';
import { detectionJobsRepository, pipelineEngine } from './detection-jobs.repository.js';
import { generateStoredAlertExplanation } from './alert-explanation.generator.js';
import {
  buildMlTemporalContext,
  requestMlShadowPrediction,
  type MlTemporalContext,
  type MlShadowResult,
} from './ml-shadow.client.js';
import { requestLlmClassification } from './llm-classifier.client.js';

type ProcessingFailure = {
  eventId: string;
  processingFailure: {
    code: string;
    stage: 'ML_MODEL' | 'FOUNDATION_SEC';
    message: string;
  };
};

type SuccessfulDetection = {
  id: string;
  eventId: string;
  score: number;
  baselineReady: boolean;
  threshold: number;
  thresholdSource: string;
  isAnomaly: boolean;
  occurredAt: Date;
  features: ContextualDecision['features'];
  groupKey: string;
  explanationText?: string;
  explanationGeneratedAt?: Date;
};

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

function createAiOnlyDecision(event: ContextEvent): ContextualDecision {
  const groupKey = createHash('sha256')
    .update(
      JSON.stringify([
        'ai-triage-v1',
        event.event_source_id,
        event.event_family,
        event.account_identifier ?? event.source_ip ?? event.id,
        event.source_ip,
      ]),
    )
    .digest('hex');
  return {
    baselineReady: false,
    score: 0,
    matchedRules: [],
    groupKey,
    features: [
      {
        featureName: 'detection_mode',
        featureValue: JSON.stringify({
          mode: 'AI_ONLY',
          legacyRulesEvaluated: false,
          legacySevenDayBaselineEvaluated: false,
        }),
        contributionScore: 0,
        rank: 1,
      },
      {
        featureName: 'evidence_event_ids',
        featureValue: JSON.stringify([event.id]),
        contributionScore: 0,
        rank: 2,
      },
      {
        featureName: 'detection_group',
        featureValue: JSON.stringify(groupKey),
        contributionScore: 0,
        rank: 3,
      },
    ],
  };
}

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
    const aiOnlyMode = env.AI_FUSION_ENABLED && env.AI_FUSION_CAN_CREATE_ALERTS;
    const explanations = new Map<string, Promise<string>>();
    // One shared deadline for optional prose across the entire batch, not a
    // separate 60-second wait for every alert. Explicit regeneration is unchanged.
    const explanationDeadline = Date.now() + 5_000;
    const evaluated: Array<SuccessfulDetection | ProcessingFailure> = [];
    // Bound DB/LLM concurrency; every event uses its own event-time history including previously evaluated events.
    for (let offset = 0; offset < batch.events.length; offset += 4) {
      evaluated.push(
        ...(await Promise.all(
          batch.events.slice(offset, offset + 4).map(async (event) => {
            let decision: ContextualDecision;
            if (aiOnlyMode) {
              decision = createAiOnlyDecision(event);
            } else {
              const context = await anomalyDetectionRepository.findEventContext(event);
              decision = evaluateContext(
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
            }
            let score = decision.score;
            const assetId = event.event_entity_mappings[0]?.asset_id;
            const customThreshold = assetId ? parameters.assetThresholds[assetId] : undefined;
            const configuredThresholdSource = customThreshold?.enabled
              ? 'ASSET_OVERRIDE'
              : 'MODEL_DEFAULT';
            let thresholdSource = configuredThresholdSource;
            let threshold = customThreshold?.enabled
              ? customThreshold.threshold
              : parameters.threshold;
            let isAnomaly = decision.baselineReady && score >= threshold;
            if (!aiOnlyMode)
              decision.features.push({
                featureName: 'configured_threshold',
                featureValue: JSON.stringify({ threshold, source: configuredThresholdSource }),
                contributionScore: 0,
                rank: decision.features.length + 1,
              });
            let mlPrediction: MlShadowResult | null = null;
            let temporalContext: MlTemporalContext | undefined;
            let scoringReady = decision.baselineReady;
            if (env.ML_SHADOW_ENABLED || env.AI_FUSION_ENABLED) {
              const mlHistory = await anomalyDetectionRepository.findMlTemporalContext(event);
              temporalContext = buildMlTemporalContext(event, mlHistory);
              mlPrediction = await requestMlShadowPrediction(event, {
                temporalContext,
              });
              decision.features.push({
                featureName: 'ml_shadow_prediction',
                featureValue: JSON.stringify(mlPrediction),
                contributionScore: 0,
                rank: decision.features.length + 1,
              });
            }
            if (aiOnlyMode && mlPrediction?.status !== 'PREDICTED') {
              const reason = mlPrediction?.status === 'UNAVAILABLE' ? mlPrediction.reason : 'DISABLED';
              return {
                eventId: event.id,
                processingFailure: {
                  code:
                    reason === 'TIMEOUT'
                      ? 'ML_MODEL_TIMEOUT'
                      : reason === 'INVALID_RESPONSE'
                        ? 'ML_INVALID_RESPONSE'
                        : 'ML_MODEL_UNAVAILABLE',
                  stage: 'ML_MODEL' as const,
                  message:
                    reason === 'TIMEOUT'
                      ? 'The anomaly detection model timed out.'
                      : 'The anomaly detection model is unavailable.',
                },
              };
            }
            const modelEscalated =
              mlPrediction?.status === 'PREDICTED' &&
              mlPrediction.prediction.score >= mlPrediction.prediction.escalationThreshold;
            const llmPrediction =
              env.AI_FUSION_ENABLED && modelEscalated
                ? await requestLlmClassification(event, temporalContext)
                : null;
            if (llmPrediction) {
              decision.features.push({
                featureName: 'llm_security_classification',
                featureValue: JSON.stringify(llmPrediction),
                contributionScore: 0,
                rank: decision.features.length + 1,
              });
            }
            if (
              aiOnlyMode &&
              modelEscalated &&
              (!llmPrediction || llmPrediction.status !== 'PREDICTED')
            ) {
              const reason = llmPrediction?.status === 'UNAVAILABLE' ? llmPrediction.reason : 'DISABLED';
              return {
                eventId: event.id,
                processingFailure: {
                  code:
                    reason === 'TIMEOUT'
                      ? 'LLM_TIMEOUT'
                      : reason === 'INVALID_RESPONSE'
                        ? 'LLM_INVALID_RESPONSE'
                        : 'LLM_UNAVAILABLE',
                  stage: 'FOUNDATION_SEC' as const,
                  message:
                    reason === 'TIMEOUT'
                      ? 'Foundation-Sec analysis timed out.'
                      : 'Foundation-Sec analysis is unavailable.',
                },
              };
            }
            const triage = !env.AI_FUSION_ENABLED
              ? { status: 'DISABLED' as const }
              : mlPrediction?.status !== 'PREDICTED'
                ? { status: 'ML_UNAVAILABLE' as const }
                : modelEscalated
                  ? {
                      status: 'ESCALATED_TO_LLM' as const,
                      modelScore: mlPrediction.prediction.score,
                      escalationThreshold: mlPrediction.prediction.escalationThreshold,
                      llmStatus: llmPrediction?.status ?? 'NOT_CALLED',
                    }
                  : {
                      status: 'LOW_RISK_MONITOR' as const,
                      modelScore: mlPrediction.prediction.score,
                      escalationThreshold: mlPrediction.prediction.escalationThreshold,
                    };
            decision.features.push({
              featureName: 'ai_triage_decision',
              featureValue: JSON.stringify(triage),
              contributionScore: 0,
              rank: decision.features.length + 1,
            });
            if (aiOnlyMode) {
              if (mlPrediction?.status !== 'PREDICTED')
                throw new Error('ML prediction state changed during AI-only evaluation');
              if (!modelEscalated) {
                scoringReady = true;
                score = mlPrediction.prediction.score;
                threshold = mlPrediction.prediction.escalationThreshold;
                isAnomaly = false;
                thresholdSource = 'AI_MODEL_TRIAGE';
              } else if (llmPrediction?.status === 'PREDICTED') {
                scoringReady = true;
                score = llmPrediction.prediction.score;
                if (llmPrediction.prediction.verdict === 'MALICIOUS') {
                  // The LLM verdict is the final decision. The numeric fields are
                  // retained for schema/report compatibility and are not a
                  // calibrated probability boundary.
                  threshold = mlPrediction.prediction.escalationThreshold;
                  isAnomaly = true;
                  thresholdSource = 'AI_LLM_FINAL';
                } else if (llmPrediction.prediction.verdict === 'SUSPICIOUS') {
                  threshold = 1;
                  score = Math.min(score, 0.99999999);
                  isAnomaly = false;
                  thresholdSource = 'AI_LLM_FINAL';
                } else {
                  threshold = mlPrediction.prediction.escalationThreshold;
                  score = Math.min(score, 0.99999999);
                  isAnomaly = false;
                  thresholdSource = 'AI_LLM_FINAL';
                }
              }
            }
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
              baselineReady: scoringReady,
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
    const failures = evaluated.flatMap((item) =>
      'processingFailure' in item ? [{ eventId: item.eventId, ...item.processingFailure }] : [],
    );
    const detections = evaluated.filter((item): item is SuccessfulDetection =>
      !('processingFailure' in item),
    );
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
      eventsEvaluated: evaluated.length,
      processingFailures: failures.length,
      anomaliesDetected: detections.filter((item) => item.isAnomaly).length,
      insufficientBaseline: detections.filter((item) => !item.baselineReady).length,
      engineVersion: env.DETECTION_PIPELINE_ENABLED ? pipelineEngine : 'contextual-rules-v1',
      timeZone: parameters.detectionPolicy.timeZone,
      customThresholdsApplied: detections.filter((item) => item.threshold !== parameters.threshold)
        .length,
    } satisfies Prisma.InputJsonObject;
    if (evaluated.length === 0) {
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
      failures,
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
