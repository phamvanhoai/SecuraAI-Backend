import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type {
  CreateModelConfigurationBody,
  ListModelConfigurationsQuery,
} from './dto/model-configuration.dto.js';
import type { ListAlertsQuery } from './dto/alert-query.dto.js';
import type { EvaluateAlertReliabilityBody } from './dto/alert-feedback.dto.js';

export const alertSelect = {
  ai_alert_id: true,
  alert_code: true,
  anomaly_score: true,
  title: true,
  description: true,
  status: true,
  detected_at: true,
  created_at: true,
  assets: { select: { asset_id: true, asset_code: true, name: true } },
  log_sources: { select: { log_source_id: true, name: true, source_type: true } },
  ai_model_versions: {
    select: { ai_model_version_id: true, model_name: true, version: true, provider: true },
  },
  security_events: { select: { security_event_id: true, event_type: true, event_time: true } },
} satisfies Prisma.ai_alertsSelect;

export type AlertRecord = Prisma.ai_alertsGetPayload<{ select: typeof alertSelect }>;

export const modelConfigurationSelect = {
  ai_model_version_id: true,
  model_name: true,
  algorithm: true,
  version: true,
  provider: true,
  model_path: true,
  parameters: true,
  is_active: true,
  created_at: true,
} satisfies Prisma.ai_model_versionsSelect;

export type ModelConfigurationRecord = Prisma.ai_model_versionsGetPayload<{
  select: typeof modelConfigurationSelect;
}>;

type RequestContext = {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type DetectionEvent = {
  id: string;
  logSourceId: string;
  assetId: string | null;
  eventType: string;
  eventTime: Date;
  sourceIp: string | null;
};

export type AlertCandidate = {
  alertCode: string;
  securityEventId: string;
  logSourceId: string;
  assetId: string | null;
  modelVersionId: string;
  ruleId: string;
  title: string;
  description: string;
  anomalyScore: number;
};

export const feedbackSelect = {
  ai_feedback_id: true,
  ai_alert_id: true,
  reviewed_by_user_id: true,
  feedback_label: true,
  comment: true,
  created_at: true,
} satisfies Prisma.ai_feedbackSelect;

export type FeedbackRecord = Prisma.ai_feedbackGetPayload<{ select: typeof feedbackSelect }>;

const toParametersJson = (input: CreateModelConfigurationBody): Prisma.InputJsonObject => ({
  ollamaModel: input.ollamaModel,
  rules: input.rules.map((rule) => ({ ...rule })),
});

export const aiAlertsRepository = {
  evaluateAlertReliability(
    alertId: string,
    input: EvaluateAlertReliabilityBody,
    context: RequestContext,
  ): Promise<FeedbackRecord | null> {
    return prisma.$transaction(async (transaction) => {
      const alert = await transaction.ai_alerts.findUnique({
        where: { ai_alert_id: alertId },
        select: { ai_alert_id: true },
      });
      if (!alert) return null;
      const feedback = await transaction.ai_feedback.create({
        data: {
          ai_alert_id: alertId,
          reviewed_by_user_id: context.actorUserId,
          feedback_label: input.feedbackLabel,
          ...(input.comment !== undefined && { comment: input.comment }),
        },
        select: feedbackSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'ai-alerts',
          action: 'ai_alert.reliability_evaluated',
          entity_type: 'ai_alert',
          entity_id: alertId,
          after_data: {
            feedbackId: feedback.ai_feedback_id,
            feedbackLabel: feedback.feedback_label,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return feedback;
    });
  },

  async listAlerts(query: ListAlertsQuery): Promise<{ items: AlertRecord[]; total: number }> {
    const where: Prisma.ai_alertsWhereInput = {
      ...(query.status !== undefined && { status: query.status }),
      ...(query.assetId !== undefined && { asset_id: query.assetId }),
      ...(query.logSourceId !== undefined && { log_source_id: query.logSourceId }),
      ...(query.detectedAfter !== undefined && { detected_at: { gt: query.detectedAfter } }),
    };
    const [total, items] = await prisma.$transaction([
      prisma.ai_alerts.count({ where }),
      prisma.ai_alerts.findMany({
        where,
        select: alertSelect,
        orderBy: [{ detected_at: query.sortOrder }, { ai_alert_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },

  findActiveDetectionModels() {
    return prisma.ai_model_versions.findMany({
      where: { is_active: true },
      select: {
        ai_model_version_id: true,
        model_name: true,
        version: true,
        parameters: true,
      },
      orderBy: [{ model_name: 'asc' }, { created_at: 'desc' }],
      take: 20,
    });
  },

  countMatchingEvents(
    event: DetectionEvent,
    windowSeconds: number,
    groupBy: 'sourceIp' | 'logSource',
  ): Promise<number> {
    const windowStart = new Date(event.eventTime.getTime() - windowSeconds * 1000);
    return prisma.security_events.count({
      where: {
        event_type: event.eventType,
        event_time: { gte: windowStart, lte: event.eventTime },
        ...(groupBy === 'sourceIp' && event.sourceIp !== null
          ? { source_ip: event.sourceIp }
          : { log_source_id: event.logSourceId }),
      },
    });
  },

  createAlertIfMissing(
    candidate: AlertCandidate,
    context: RequestContext,
  ): Promise<AlertRecord | null> {
    return prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.ai_alerts.findFirst({
          where: {
            security_event_id: candidate.securityEventId,
            ai_model_version_id: candidate.modelVersionId,
            description: { startsWith: `[rule:${candidate.ruleId}]` },
          },
          select: { ai_alert_id: true },
        });
        if (existing) return null;
        const alert = await transaction.ai_alerts.create({
          data: {
            alert_code: candidate.alertCode,
            security_event_id: candidate.securityEventId,
            log_source_id: candidate.logSourceId,
            asset_id: candidate.assetId,
            ai_model_version_id: candidate.modelVersionId,
            anomaly_score: candidate.anomalyScore,
            title: candidate.title,
            description: candidate.description,
            status: 'new',
          },
          select: alertSelect,
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'ai-alerts',
            action: 'ai_alert.created',
            entity_type: 'ai_alert',
            entity_id: alert.ai_alert_id,
            after_data: {
              alertCode: alert.alert_code,
              modelVersionId: candidate.modelVersionId,
              ruleId: candidate.ruleId,
              status: 'new',
            },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });
        return alert;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  },

  async listModelConfigurations(
    query: ListModelConfigurationsQuery,
  ): Promise<{ items: ModelConfigurationRecord[]; total: number }> {
    const where: Prisma.ai_model_versionsWhereInput = {
      ...(query.modelName !== undefined && { model_name: query.modelName }),
      ...(query.active !== undefined && { is_active: query.active }),
    };
    const [total, items] = await prisma.$transaction([
      prisma.ai_model_versions.count({ where }),
      prisma.ai_model_versions.findMany({
        where,
        select: modelConfigurationSelect,
        orderBy: [{ created_at: 'desc' }, { ai_model_version_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },

  createModelConfiguration(
    input: CreateModelConfigurationBody,
    context: RequestContext,
  ): Promise<ModelConfigurationRecord> {
    return prisma.$transaction(async (transaction) => {
      const model = await transaction.ai_model_versions.create({
        data: {
          model_name: input.modelName,
          algorithm: input.algorithm,
          version: input.version,
          provider: input.provider,
          ...(input.modelPath !== undefined && { model_path: input.modelPath }),
          parameters: toParametersJson(input),
          is_active: false,
        },
        select: modelConfigurationSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'ai-alerts',
          action: 'ai_model_configuration.created',
          entity_type: 'ai_model_version',
          entity_id: model.ai_model_version_id,
          after_data: {
            modelName: model.model_name,
            algorithm: model.algorithm,
            version: model.version,
            provider: model.provider,
            parameters: toParametersJson(input),
            active: false,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return model;
    });
  },

  activateModelConfiguration(
    modelVersionId: string,
    context: RequestContext,
  ): Promise<ModelConfigurationRecord | null> {
    return prisma.$transaction(
      async (transaction) => {
        const target = await transaction.ai_model_versions.findUnique({
          where: { ai_model_version_id: modelVersionId },
          select: modelConfigurationSelect,
        });
        if (!target) return null;
        await transaction.ai_model_versions.updateMany({
          where: { model_name: target.model_name, is_active: true },
          data: { is_active: false },
        });
        const activated = await transaction.ai_model_versions.update({
          where: { ai_model_version_id: modelVersionId },
          data: { is_active: true },
          select: modelConfigurationSelect,
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'ai-alerts',
            action: 'ai_model_configuration.activated',
            entity_type: 'ai_model_version',
            entity_id: modelVersionId,
            before_data: { active: target.is_active },
            after_data: { active: true },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });
        return activated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  },
};
