import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import type { RunAnomalyDetectionBody } from './dto/run-anomaly-detection.dto.js';
import { anomalyDetectionRepository, type DetectionEvent } from './anomaly-detection.repository.js';

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
  })
  .passthrough();
const severityScore: Readonly<Record<string, number>> = {
  critical: 1,
  high: 0.85,
  medium: 0.55,
  low: 0.2,
};

function scoreEvent(
  event: DetectionEvent,
  frequency: number,
  populationSize: number,
  weights: z.infer<typeof parametersSchema>['weights'],
): number {
  const severity = severityScore[event.severity?.toLowerCase() ?? ''] ?? 0.35;
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
  async run(userId: string, input: RunAnomalyDetectionBody, correlationId?: string) {
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
    const parsed = parametersSchema.safeParse(model.parameters ?? {});
    const parameters = parsed.success ? parsed.data : parametersSchema.parse({});
    const since = new Date(Date.now() - input.lookbackHours * 3_600_000);
    const batch = await anomalyDetectionRepository.findPendingEvents(
      model.id,
      since,
      input.maxEvents,
    );
    const detections = batch.events.map((event) => {
      const score = scoreEvent(
        event,
        batch.frequencies.get(event.event_type) ?? 0,
        batch.populationSize,
        parameters.weights,
      );
      return {
        id: randomUUID(),
        eventId: event.id,
        score,
        threshold: parameters.threshold,
        isAnomaly: score >= parameters.threshold,
      };
    });
    const summary = {
      modelVersionId: model.id,
      modelName: model.model_name,
      modelVersion: model.version,
      lookbackHours: input.lookbackHours,
      eventsEvaluated: detections.length,
      anomaliesDetected: detections.filter((item) => item.isAnomaly).length,
    } satisfies Prisma.InputJsonObject;
    const persisted = await anomalyDetectionRepository.persistRun({
      actorUserId: userId,
      modelVersionId: model.id,
      ...(correlationId ? { correlationId } : {}),
      detections,
      summary,
    });
    return {
      ...summary,
      ...persisted,
      threshold: parameters.threshold,
      completedAt: new Date().toISOString(),
    };
  },
};
