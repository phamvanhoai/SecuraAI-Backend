import { AppError } from '../../common/errors/app-error.js';
import { z } from 'zod';
import { anomalyDetectionRepository } from './anomaly-detection.repository.js';
import { aiAlertsRepository, type AiAlertRecord } from './ai-alerts.repository.js';
import type { ListAiAlertsQuery } from './dto/list-ai-alerts.dto.js';
import type {
  CreateAiAlertFeedback,
  ListAiAlertFeedbackQuery,
} from './dto/ai-alert-feedback.dto.js';
import type { Prisma, triage_decision } from '@prisma/client';
import type { ConfirmAiAlert } from './dto/confirm-ai-alert.dto.js';
import type { MarkAiAlertFalsePositive } from './dto/mark-ai-alert-false-positive.dto.js';
import type { ListAlertThresholdsQuery, SetAlertThresholdBody } from './dto/alert-threshold.dto.js';
import type { ListModelVersionsQuery } from './dto/list-model-versions.dto.js';

const storedThresholdSchema = z.object({
  threshold: z.number().min(0.01).max(1),
  riskLevelMin: z.enum(['low', 'medium', 'high', 'critical']).nullable(),
  enabled: z.boolean(),
  updatedByUserId: z.uuid(),
  updatedAt: z.iso.datetime({ offset: true }),
});

function thresholdResponse(record: {
  asset: { id: string; asset_code: string; name: string };
  configuration: unknown;
}) {
  const configuration = storedThresholdSchema.parse(record.configuration);
  return {
    id: record.asset.id,
    asset: { id: record.asset.id, assetCode: record.asset.asset_code, name: record.asset.name },
    ...configuration,
  };
}

function responseStatus(status: AiAlertRecord['status']) {
  if (status === 'NEW') return 'new' as const;
  if (status === 'IN_TRIAGE' || status === 'NEED_INVESTIGATION') return 'reviewing' as const;
  if (status === 'CONFIRMED') return 'confirmed' as const;
  return 'dismissed' as const;
}

function toResponse(alert: AiAlertRecord) {
  const detection = alert.anomaly_detections;
  const event = detection.normalized_events;
  const model = detection.ai_model_versions;
  const asset = event.event_entity_mappings[0]?.assets ?? null;
  const eventTitle = event.event_type
    .replaceAll('_', ' ')
    .replace(/^./, (value) => value.toUpperCase());
  return {
    id: alert.id,
    alertCode: `ALT-${alert.id.slice(0, 8).toUpperCase()}`,
    anomalyScore: detection.anomaly_score.toNumber(),
    riskScore: null,
    riskLevel: alert.severity,
    title: eventTitle,
    description: `${eventTitle} exceeded the deployed anomaly model threshold.`,
    status: responseStatus(alert.status),
    detectedAt: detection.detected_at,
    asset: asset ? { id: asset.id, assetCode: asset.asset_code, name: asset.name } : null,
    logSource: {
      id: event.event_sources.id,
      name: event.event_sources.name,
      sourceType: event.event_sources.source_type,
    },
    model: {
      id: model.id,
      name: model.model_name,
      version: model.version,
      provider: model.model_type,
    },
    event: { id: event.id, eventType: event.event_type, eventTime: event.occurred_at },
    createdAt: alert.created_at,
  };
}

export const aiAlertsService = {
  async listModelVersions(userId: string, query: ListModelVersionsQuery) {
    await requireSecurityOfficer(userId);
    const [total, models] = await aiAlertsRepository.listModelVersions(query);
    return {
      items: models.map((model) => {
        const evaluation = model.ai_model_evaluations[0];
        return {
          id: model.id,
          modelName: model.model_name,
          modelType: model.model_type,
          version: model.version,
          status: model.status.toLowerCase(),
          featureDefinition: model.feature_definition,
          parameters: model.parameters,
          dataset: model.ai_datasets
            ? {
                id: model.ai_datasets.id,
                name: model.ai_datasets.name,
                version: model.ai_datasets.version,
              }
            : null,
          latestEvaluation: evaluation
            ? {
                id: evaluation.id,
                precision: decimalNumber(evaluation.precision),
                recall: decimalNumber(evaluation.recall),
                f1Score: decimalNumber(evaluation.f1_score),
                prAuc: decimalNumber(evaluation.pr_auc),
                falsePositiveRate: decimalNumber(evaluation.false_positive_rate),
                alertsPerDay: decimalNumber(evaluation.alerts_per_day),
                detectionLatencyMs: decimalNumber(evaluation.detection_latency_ms),
                notes: evaluation.evaluation_notes,
                evaluatedAt: evaluation.evaluated_at,
              }
            : null,
          deployedAt: model.deployed_at,
          retiredAt: model.retired_at,
          createdAt: model.created_at,
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async listAlertThresholds(userId: string, query: ListAlertThresholdsQuery) {
    await requireSecurityOfficer(userId);
    const [total, records] = await aiAlertsRepository.listAlertThresholds(query);
    return {
      items: records.map((record) => thresholdResponse(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async setAlertThreshold(userId: string, assetId: string, input: SetAlertThresholdBody) {
    await requireSecurityOfficer(userId);
    const result = await aiAlertsRepository.setAlertThreshold(assetId, userId, input);
    if (result.outcome === 'asset_not_found')
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Active asset not found');
    if (result.outcome === 'model_not_found')
      throw new AppError(
        409,
        'NO_DEPLOYED_MODEL',
        'Deploy an anomaly detection model before setting thresholds',
      );
    return thresholdResponse(result);
  },
  async metrics(userId: string) {
    await requireSecurityOfficer(userId);
    const detectedAfter = new Date(Date.now() - 86_400_000);
    const groups = await aiAlertsRepository.metrics(detectedAfter);
    const count = (statuses: AiAlertRecord['status'][]): number =>
      groups
        .filter((group) => statuses.includes(group.status))
        .reduce((total, group) => total + group._count._all, 0);
    return {
      total: groups.reduce((total, group) => total + group._count._all, 0),
      newAlerts: count(['NEW']),
      reviewing: count(['IN_TRIAGE', 'NEED_INVESTIGATION']),
      confirmed: count(['CONFIRMED']),
    };
  },
  async list(userId: string, query: ListAiAlertsQuery) {
    const actor = await anomalyDetectionRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const serverTime = new Date();
    const [total, alerts] = await aiAlertsRepository.list(query);
    return {
      items: alerts.map(toResponse),
      serverTime,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async getExplanation(userId: string, alertId: string) {
    await requireSecurityOfficer(userId);
    const alert = await aiAlertsRepository.findExplanation(alertId);
    if (!alert) throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert not found');
    const detection = alert.anomaly_detections;
    const score = detection.anomaly_score.toNumber();
    const threshold = detection.threshold.toNumber();
    const contributions = detection.anomaly_feature_contributions.map((feature) => ({
      featureName: feature.feature_name,
      featureValue: feature.feature_value,
      contributionScore: feature.contribution_score?.toNumber() ?? null,
      rank: feature.rank,
    }));
    const riskLevel = alert.severity?.toLowerCase() ?? null;
    const levelText = riskLevel ? ` The suggested risk level is ${riskLevel}.` : '';
    const factorText = contributions[0]
      ? ` The strongest recorded factor is ${contributions[0].featureName}.`
      : ' No individual feature contributions were recorded.';
    return {
      id: detection.id,
      alertId: alert.id,
      explanationText: `The anomaly score ${score.toFixed(4)} exceeded the model threshold ${threshold.toFixed(4)}.${levelText}${factorText}`,
      featureContributions: contributions,
      baselineData: {
        anomalyScore: score,
        threshold,
        scoreAboveThreshold: Number((score - threshold).toFixed(8)),
        suggestedRiskLevel: riskLevel,
        detectedAt: detection.detected_at,
      },
      createdAt: alert.created_at,
    };
  },
  async createFeedback(userId: string, alertId: string, input: CreateAiAlertFeedback) {
    await requireSecurityOfficer(userId);
    const alert = await aiAlertsRepository.findForFeedback(alertId);
    if (!alert) throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert not found');
    const decision = feedbackDecision(input.feedbackLabel);
    const created = await aiAlertsRepository.createFeedback({
      alertId,
      analystUserId: userId,
      decision,
      reason: input.comment?.trim() || defaultFeedbackReason(input.feedbackLabel),
      modelVersionId: alert.anomaly_detections.model_version_id,
    });
    return feedbackResponse(created);
  },
  async listFeedback(userId: string, alertId: string, query: ListAiAlertFeedbackQuery) {
    await requireSecurityOfficer(userId);
    const alert = await aiAlertsRepository.findForFeedback(alertId);
    if (!alert) throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert not found');
    const [total, records] = await aiAlertsRepository.listFeedback(alertId, query);
    return {
      items: records.map(feedbackResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async confirmAsIncident(userId: string, alertId: string, input: ConfirmAiAlert) {
    await requireSecurityOfficer(userId);
    const result = await aiAlertsRepository.confirmAsIncident({
      alertId,
      userId,
      ...(input.comment ? { comment: input.comment } : {}),
    });
    if (!result) throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert not found');
    return {
      id: result.alert.id,
      alertCode: `ALT-${result.alert.id.slice(0, 8).toUpperCase()}`,
      status: 'confirmed' as const,
      reviewedByUserId: userId,
      reviewedAt: result.incident.confirmed_at,
      changed: result.changed,
      incident: {
        id: result.incident.id,
        code: result.incident.incident_code,
        status: result.incident.status,
        created: result.changed,
      },
    };
  },
  async markFalsePositive(userId: string, alertId: string, input: MarkAiAlertFalsePositive) {
    await requireSecurityOfficer(userId);
    const result = await aiAlertsRepository.markFalsePositive({
      alertId,
      userId,
      ...(input.comment ? { comment: input.comment } : {}),
    });
    if (result.outcome === 'not_found')
      throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert not found');
    if (result.outcome === 'confirmed')
      throw new AppError(
        409,
        'AI_ALERT_ALREADY_CONFIRMED',
        'A confirmed security incident cannot be marked as a false positive',
      );
    return {
      id: result.alert.id,
      alertCode: `ALT-${result.alert.id.slice(0, 8).toUpperCase()}`,
      status: 'false_positive' as const,
      reviewedByUserId: result.triage.analyst_user_id,
      reviewedAt: result.triage.completed_at ?? result.triage.created_at,
      changed: result.outcome === 'changed',
    };
  },
};

function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value?.toNumber() ?? null;
}

async function requireSecurityOfficer(userId: string): Promise<void> {
  const actor = await anomalyDetectionRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}

function feedbackDecision(label: CreateAiAlertFeedback['feedbackLabel']): triage_decision {
  if (label === 'confirmed_incident') return 'VALID_ANOMALY';
  if (label === 'false_positive') return 'FALSE_POSITIVE';
  return 'NEED_INVESTIGATION';
}

function feedbackLabel(decision: triage_decision): CreateAiAlertFeedback['feedbackLabel'] {
  if (decision === 'VALID_ANOMALY') return 'confirmed_incident';
  if (decision === 'FALSE_POSITIVE') return 'false_positive';
  return 'needs_review';
}

function defaultFeedbackReason(label: CreateAiAlertFeedback['feedbackLabel']): string {
  if (label === 'confirmed_incident') return 'Confirmed incident';
  if (label === 'false_positive') return 'False positive';
  return 'Needs further review';
}

function feedbackResponse(record: {
  id: string;
  alert_id: string;
  analyst_user_id: string;
  decision: triage_decision;
  reason: string;
  created_at: Date;
}) {
  return {
    id: record.id,
    alertId: record.alert_id,
    reviewedByUserId: record.analyst_user_id,
    feedbackLabel: feedbackLabel(record.decision),
    comment: record.reason,
    createdAt: record.created_at,
  };
}
