import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import type { RunAnomalyDetectionBody } from './dto/run-anomaly-detection.dto.js';
import { anomalyDetectionRepository, type DetectionEvent } from './anomaly-detection.repository.js';
import { generateStoredAlertExplanation } from './alert-explanation.generator.js';

const parametersSchema = z
  .object({
    threshold: z.number().min(0.5).max(1).default(0.8),
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
const severityScore: Readonly<Record<string, number>> = {
  critical: 1,
  high: 0.85,
  medium: 0.55,
  low: 0.2,
};
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

function normalizedSeverity(value: string | null): number {
  const named = severityScore[value?.toLowerCase() ?? ''];
  if (named !== undefined) return named;
  const wazuhLevel = Number(value);
  return Number.isFinite(wazuhLevel) ? Math.min(1, Math.max(0, wazuhLevel / 15)) : 0.35;
}

function scoreEvent(
  event: DetectionEvent,
  frequency: number,
  populationSize: number,
  weights: z.infer<typeof parametersSchema>['weights'],
): number {
  const severity = normalizedSeverity(event.severity);
  const rarity = populationSize === 0 ? 0 : 1 - frequency / populationSize;
  const hour = event.occurred_at.getUTCHours();
  const offHours = hour < 6 || hour >= 22 ? 1 : 0;
  const totalWeight = weights.severity + weights.rarity + weights.offHours;
  return totalWeight === 0
    ? 0
    : Math.min(
        1,
        Math.max(
          0,
          (severity * weights.severity + rarity * weights.rarity + offHours * weights.offHours) /
            totalWeight,
        ),
      );
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
  const parameters = parsed.success ? parsed.data : parametersSchema.parse({});
  const since =
    input.lookbackHours === null
      ? null
      : new Date(Date.now() - input.lookbackHours * 3_600_000);
  const batch = await anomalyDetectionRepository.findPendingEvents(
    model.id,
    since,
    input.maxEvents,
    input.eventScope,
  );
  const detectedAt = new Date();
  const detections = await Promise.all(
    batch.events.map(async (event) => {
      const score = scoreEvent(
        event,
        batch.frequencies.get(event.event_type) ?? 0,
        batch.populationSize,
        parameters.weights,
      );
      const assetId = event.event_entity_mappings[0]?.asset_id;
      const customThreshold = assetId ? parameters.assetThresholds[assetId] : undefined;
      const thresholdSource = customThreshold?.enabled ? 'ASSET_OVERRIDE' : 'MODEL_DEFAULT';
      const threshold = customThreshold?.enabled ? customThreshold.threshold : parameters.threshold;
      const isAnomaly = score >= threshold;
      const explanationText = isAnomaly
        ? await generateStoredAlertExplanation({
            anomalyScore: score,
            threshold,
            suggestedRiskLevel: 'high',
            detectedAt,
            featureContributions: [],
            eventId: event.id,
          })
        : undefined;
      return {
        id: randomUUID(),
        eventId: event.id,
        score,
        threshold,
        thresholdSource,
        isAnomaly,
        ...(explanationText ? { explanationText, explanationGeneratedAt: detectedAt } : {}),
      };
    }),
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
    eventsEvaluated: detections.length,
    anomaliesDetected: detections.filter((item) => item.isAnomaly).length,
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
}
