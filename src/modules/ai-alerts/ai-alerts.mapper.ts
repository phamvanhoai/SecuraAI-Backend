import type { ModelConfigurationRecord } from './ai-alerts.repository.js';
import type { AlertRecord, FeedbackRecord } from './ai-alerts.repository.js';

export const toAlertFeedbackResponse = (feedback: FeedbackRecord) => ({
  id: feedback.ai_feedback_id,
  alertId: feedback.ai_alert_id,
  reviewedByUserId: feedback.reviewed_by_user_id,
  feedbackLabel: feedback.feedback_label,
  comment: feedback.comment,
  createdAt: feedback.created_at,
});

export const toModelConfigurationResponse = (model: ModelConfigurationRecord) => ({
  id: model.ai_model_version_id,
  modelName: model.model_name,
  algorithm: model.algorithm,
  version: model.version,
  provider: model.provider,
  modelPath: model.model_path,
  parameters: model.parameters,
  active: model.is_active,
  createdAt: model.created_at,
});

export const toAlertResponse = (alert: AlertRecord) => ({
  id: alert.ai_alert_id,
  alertCode: alert.alert_code,
  anomalyScore: alert.anomaly_score.toNumber(),
  title: alert.title,
  description: alert.description,
  status: alert.status,
  detectedAt: alert.detected_at,
  asset: alert.assets
    ? { id: alert.assets.asset_id, assetCode: alert.assets.asset_code, name: alert.assets.name }
    : null,
  logSource: {
    id: alert.log_sources.log_source_id,
    name: alert.log_sources.name,
    sourceType: alert.log_sources.source_type,
  },
  model: {
    id: alert.ai_model_versions.ai_model_version_id,
    name: alert.ai_model_versions.model_name,
    version: alert.ai_model_versions.version,
    provider: alert.ai_model_versions.provider,
  },
  event: {
    id: alert.security_events.security_event_id,
    eventType: alert.security_events.event_type,
    eventTime: alert.security_events.event_time,
  },
  createdAt: alert.created_at,
});
