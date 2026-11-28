import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import type { RunAnomalyDetectionBody } from './dto/run-anomaly-detection.dto.js';
import { anomalyDetectionRepository } from './anomaly-detection.repository.js';
import { detectionSeverity, type ContextEvent, type DetectionFeature } from './detection-model.js';
import { env } from '../../config/env.js';
import { detectionJobsRepository, pipelineEngine } from './detection-jobs.repository.js';
import { generateStoredAlertExplanation } from './alert-explanation.generator.js';
import {
  buildMlTemporalContext,
  requestMlPrediction,
  type MlTemporalContext,
  type MlPredictionResult,
} from './ml-classifier.client.js';
import { requestLlmClassification } from './llm-classifier.client.js';

// Represent one event that could not complete the required ML or LLM stage.
// The batch keeps this result so the failure can be reported and retried.
type ProcessingFailure = {
  eventId: string;
  processingFailure: {
    code: string;
    stage: 'ML_MODEL' | 'FOUNDATION_SEC';
    message: string;
  };
};

// Represent one event that completed detection and is ready to be persisted.
// It contains the final score, applied threshold, evidence and alert-group key.
type SuccessfulDetection = {
  id: string;
  eventId: string;
  score: number;
  outcome: 'BELOW_THRESHOLD' | 'LLM_BENIGN' | 'LLM_SUSPICIOUS' | 'MALICIOUS';
  threshold: number;
  thresholdSource: string;
  isAnomaly: boolean;
  occurredAt: Date;
  features: DetectionFeature[];
  groupKey: string;
  explanationText?: string;
  explanationGeneratedAt?: Date;
};

// Validate the deployed model parameters before any event is processed.
// Defaults keep older model records compatible with the current detection flow.
const parametersSchema = z
  .object({
    threshold: z.number().min(0.5).max(1).default(0.8),
    assetThresholds: z
      .record(
        z.string(),
        z.object({ threshold: z.number().min(0.01).max(1), enabled: z.boolean() }).passthrough(),
      )
      .default({}),
  })
  .strip();

// Hold the last in-process detection run so later runs wait for it to finish.
let detectionQueue: Promise<void> = Promise.resolve();

// Create the stable grouping key and initial evidence for the ML/LLM pipeline.
function createAiDecision(event: ContextEvent): {
  groupKey: string;
  features: DetectionFeature[];
} {
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
  // Return the group key and the first evidence item for this event.
  return {
    groupKey,
    features: [
      {
        featureName: 'detection_group',
        featureValue: JSON.stringify(groupKey),
        rank: 1,
      },
    ],
  };
}

// Queue detection runs so two batches do not overlap inside this Node process.
async function withDetectionLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = detectionQueue;
  // This callback releases the next queued detection batch.
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
  // Authorize Run Anomaly Detection and execute one bounded manual batch.
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
    // Record who started the manual run and its request information.
    const audit: {
      actor: { type: 'USER'; userId: string };
      correlationId?: string;
      sourceIp?: string;
      userAgent?: string;
    } = {
      actor: { type: 'USER' as const, userId },
    };
    if (correlationId) audit.correlationId = correlationId;
    if (context?.sourceIp) audit.sourceIp = context.sourceIp;
    if (context?.userAgent) audit.userAgent = context.userAgent;
    return withDetectionLock(async () => {
      // Manual detection can process pending events from every source.
      const result = await runDetection(
        model,
        { maxEvents: input.maxEvents, eventScope: 'ALL' },
        audit,
      );
      const hasMore = await anomalyDetectionRepository.hasPendingEvents(model.id);
      // Add manual-run scope and whether another batch is still available.
      return {
        ...result,
        scope: 'ALL_PENDING' as const,
        hasMore,
      };
    });
  },
  // Called by automated-detection.worker.ts, not by an HTTP route.
  // Process only pending real-time Wazuh events and record SYSTEM as the actor.
  async runAutomated(input: Pick<RunAnomalyDetectionBody, 'maxEvents'>) {
    const model = await anomalyDetectionRepository.findDeployedModel();
    if (!model) return null;
    return withDetectionLock(() =>
      // Automated detection processes only pending real-time Wazuh events.
      runDetection(
        model,
        { maxEvents: input.maxEvents, eventScope: 'WAZUH_REALTIME' },
        { actor: { type: 'SYSTEM' } },
      ),
    );
  },
};

// Batch flow: pending events -> 1/5/15/60-minute ML context -> ML triage
// -> LLM final review when escalated -> explanation -> transaction.
// Evaluate, classify, explain and persist one bounded event batch.
async function runDetection(
  model: Awaited<ReturnType<typeof anomalyDetectionRepository.findDeployedModel>> & {},
  input: {
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
      'The deployed detection configuration has an invalid model or asset threshold.',
    );
  const parameters = parsed.data;
  // Collect at most maxEvents results not processed by this model/engine.
  const batch = await anomalyDetectionRepository.findPendingEvents(
    model.id,
    input.maxEvents,
    input.eventScope,
  );
  try {
    const detectedAt = new Date();
    const explanations = new Map<string, Promise<string>>();
    // One shared deadline for optional prose across the entire batch, not a
    // separate 60-second wait for every alert. Explicit regeneration is unchanged.
    const explanationDeadline = Date.now() + 5_000; // 5 seconds
    const evaluated: Array<SuccessfulDetection | ProcessingFailure> = [];
    // Groups of 4 limit concurrent DB/AI calls; each result remains independent.
    for (let offset = 0; offset < batch.events.length; offset += 4) {
      evaluated.push(
        ...(await Promise.all(
          batch.events.slice(offset, offset + 4).map(async (event) => {
            // Use case: Generate Anomaly Score. ML is the required first stage;
            // there is no statistical-rule fallback when the model is unavailable.
            const decision = createAiDecision(event);
            const mlHistory = await anomalyDetectionRepository.findMlTemporalContext(event);
            const temporalContext: MlTemporalContext = buildMlTemporalContext(event, mlHistory);
            // Send the current event plus its 1/5/15/60-minute evidence to ML
            // and wait for either an anomaly score or a failure status.
            const mlPrediction: MlPredictionResult = await requestMlPrediction(event, {
              temporalContext,
            });
            // Keep the complete ML response as evidence for this detection result.
            decision.features.push({
              featureName: 'ml_prediction',
              featureValue: JSON.stringify(mlPrediction),
              rank: decision.features.length + 1,
            });
            if (mlPrediction.status !== 'PREDICTED') {
              const reason = mlPrediction.reason;
              let code = 'ML_MODEL_UNAVAILABLE';
              let message = 'The anomaly detection model is unavailable.';
              if (reason === 'TIMEOUT') {
                code = 'ML_MODEL_TIMEOUT';
                message = 'The anomaly detection model timed out.';
              } else if (reason === 'INVALID_RESPONSE') {
                code = 'ML_INVALID_RESPONSE';
              }
              // Return an ML failure for this event so the job can be retried.
              return {
                eventId: event.id,
                processingFailure: {
                  code,
                  stage: 'ML_MODEL' as const,
                  message,
                },
              };
            }
            // Apply the enabled threshold for the mapped Asset. Events without
            // one use the deployed model's common threshold.
            const assetId = event.event_entity_mappings[0]?.asset_id;
            let assetThreshold;
            if (assetId) {
              assetThreshold = parameters.assetThresholds[assetId];
            }
            let threshold = parameters.threshold;
            let thresholdSource = 'MODEL_DEFAULT';
            if (assetThreshold?.enabled) {
              threshold = assetThreshold.threshold;
              thresholdSource = 'ASSET_OVERRIDE';
            }
            // If the ML score >= threshold, send the event and its 1/5/15/60-minute context to the LLM.
            const modelEscalated = mlPrediction.prediction.score >= threshold;
            let llmPrediction: Awaited<ReturnType<typeof requestLlmClassification>> | null = null;
            if (modelEscalated) {
              llmPrediction = await requestLlmClassification(event, temporalContext);
            }
            if (llmPrediction) {
              // Store the complete LLM response as detection evidence.
              decision.features.push({
                featureName: 'llm_security_classification',
                featureValue: JSON.stringify(llmPrediction),
                rank: decision.features.length + 1,
              });
            }
            if (modelEscalated && (!llmPrediction || llmPrediction.status !== 'PREDICTED')) {
              let reason = 'DISABLED';
              if (llmPrediction?.status === 'UNAVAILABLE') {
                reason = llmPrediction.reason;
              }
              let code = 'LLM_UNAVAILABLE';
              let message = 'Foundation-Sec analysis is unavailable.';
              if (reason === 'TIMEOUT') {
                code = 'LLM_TIMEOUT';
                message = 'Foundation-Sec analysis timed out.';
              } else if (reason === 'INVALID_RESPONSE') {
                code = 'LLM_INVALID_RESPONSE';
              }
              // Return an LLM failure instead of creating an incomplete decision.
              return {
                eventId: event.id,
                processingFailure: {
                  code,
                  stage: 'FOUNDATION_SEC' as const,
                  message,
                },
              };
            }
            // ML handles low-risk triage. For escalated events, the LLM verdict
            // is final and only MALICIOUS creates an alert.
            let score = mlPrediction.prediction.score;
            let isAnomaly = false;
            let outcome: SuccessfulDetection['outcome'] = 'BELOW_THRESHOLD';
            if (modelEscalated && llmPrediction?.status === 'PREDICTED') {
              score = llmPrediction.prediction.score;
              isAnomaly = llmPrediction.prediction.verdict === 'MALICIOUS';
              if (llmPrediction.prediction.verdict === 'MALICIOUS') {
                outcome = 'MALICIOUS';
              } else if (llmPrediction.prediction.verdict === 'SUSPICIOUS') {
                outcome = 'LLM_SUSPICIOUS';
              } else {
                outcome = 'LLM_BENIGN';
              }
            }
            // The ML/LLM result and applied threshold are now final.
            // Generate Anomaly Alert uses isAnomaly in the next part of this flow.
            // Related anomalies in one 15-minute bucket reuse an explanation.
            const explanationKey = `${decision.groupKey}:${Math.floor(event.occurred_at.getTime() / (15 * 60_000))}`;
            if (isAnomaly && !explanations.has(explanationKey)) {
              let timeoutMs = Math.max(0, explanationDeadline - Date.now());
              if (env.DETECTION_PIPELINE_ENABLED) {
                timeoutMs = 0;
              }
              explanations.set(
                explanationKey,
                // Generate one explanation from the final score and stored evidence.
                generateStoredAlertExplanation(
                  {
                    anomalyScore: score,
                    threshold,
                    suggestedRiskLevel: detectionSeverity(score).toLowerCase(),
                    detectedAt,
                    evidence: decision.features,
                    eventId: event.id,
                  },
                  {
                    timeoutMs,
                  },
                ),
              );
            }
            // Only a MALICIOUS event waits for its stored explanation.
            let explanationText: string | undefined;
            if (isAnomaly) {
              explanationText = await explanations.get(explanationKey);
            }
            // Return the completed detection result for database persistence.
            const result: SuccessfulDetection = {
              id: randomUUID(),
              eventId: event.id,
              score,
              outcome,
              threshold,
              thresholdSource,
              isAnomaly,
              occurredAt: event.occurred_at,
              features: decision.features,
              groupKey: decision.groupKey,
            };
            // Add explanation fields only when explanation text exists.
            if (explanationText) {
              result.explanationText = explanationText;
              result.explanationGeneratedAt = detectedAt;
            }
            return result;
          }),
        )),
      );
    }
    const failures: Array<ProcessingFailure['processingFailure'] & { eventId: string }> = [];
    for (const item of evaluated) {
      if ('processingFailure' in item) {
        failures.push({ eventId: item.eventId, ...item.processingFailure });
      }
    }
    const detections = evaluated.filter(
      (item): item is SuccessfulDetection => !('processingFailure' in item),
    );
    // Summarize the complete batch for the API response and audit record.
    let scope = 'ALL_PENDING';
    if (input.eventScope === 'WAZUH_REALTIME') {
      scope = 'WAZUH_REALTIME';
    }
    const summary = {
      modelVersionId: model.id,
      modelName: model.model_name,
      modelVersion: model.version,
      scope,
      eventsEvaluated: evaluated.length,
      processingFailures: failures.length,
      anomaliesDetected: detections.filter((item) => item.isAnomaly).length,
      engineVersion: pipelineEngine,
      customThresholdsApplied: detections.filter(
        (item) => item.thresholdSource === 'ASSET_OVERRIDE',
      ).length,
    } satisfies Prisma.InputJsonObject;
    if (evaluated.length === 0) {
      // Return an empty successful result when no pending event was found.
      return {
        ...summary,
        detectionsCreated: 0,
        alertsCreated: 0,
        threshold: parameters.threshold,
        completedAt: new Date().toISOString(),
      };
    }
    // Save successful detections, failures, alerts and audit data atomically.
    const persisted = await anomalyDetectionRepository.persistRun({
      actor: audit.actor,
      modelVersionId: model.id,
      leaseToken: batch.leaseToken, //Automated worker get job = token
      correlationId: audit.correlationId, // link with auditlog
      detections,
      failures,
      summary,
      sourceIp: audit.sourceIp,
      userAgent: audit.userAgent,
    });
    // Combine the batch summary with the database persistence result.
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
