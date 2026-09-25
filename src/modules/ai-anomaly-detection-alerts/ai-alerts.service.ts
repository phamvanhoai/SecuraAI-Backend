import { AppError } from '../../common/errors/app-error.js';
import { anomalyDetectionRepository } from './anomaly-detection.repository.js';
import { aiAlertsRepository, type AiAlertRecord } from './ai-alerts.repository.js';
import type { ListAiAlertsQuery } from './dto/list-ai-alerts.dto.js';

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
};
