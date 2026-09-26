import type { Prisma, alert_status, model_status, triage_decision } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAiAlertsQuery } from './dto/list-ai-alerts.dto.js';
import type { ListAiAlertFeedbackQuery } from './dto/ai-alert-feedback.dto.js';
import type { ListAlertThresholdsQuery, SetAlertThresholdBody } from './dto/alert-threshold.dto.js';
import type { ListModelVersionsQuery } from './dto/list-model-versions.dto.js';

const alertSelect = {
  id: true,
  severity: true,
  status: true,
  generated_at: true,
  created_at: true,
  anomaly_detections: {
    select: {
      anomaly_score: true,
      detected_at: true,
      ai_model_versions: {
        select: { id: true, model_name: true, model_type: true, version: true },
      },
      normalized_events: {
        select: {
          id: true,
          event_type: true,
          occurred_at: true,
          event_sources: { select: { id: true, name: true, source_type: true } },
          event_entity_mappings: {
            where: { is_active: true, asset_id: { not: null } },
            orderBy: { mapped_at: 'desc' as const },
            take: 1,
            select: { assets: { select: { id: true, asset_code: true, name: true } } },
          },
        },
      },
    },
  },
} as const;

export type AiAlertRecord = Prisma.anomaly_alertsGetPayload<{ select: typeof alertSelect }>;

function databaseStatuses(status: ListAiAlertsQuery['status']): alert_status[] | undefined {
  if (!status) return undefined;
  if (status === 'new') return ['NEW'];
  if (status === 'reviewing') return ['IN_TRIAGE', 'NEED_INVESTIGATION'];
  if (status === 'confirmed') return ['CONFIRMED'];
  if (status === 'dismissed' || status === 'false_positive' || status === 'resolved')
    return ['DISMISSED'];
  return undefined;
}

function readParameters(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readThresholdMap(
  value: Prisma.JsonValue | null | undefined,
): Record<string, Prisma.JsonObject> {
  const candidate = readParameters(value).assetThresholds;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return Object.fromEntries(
    Object.entries(candidate).filter(
      (entry): entry is [string, Prisma.JsonObject] =>
        Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1]),
    ),
  );
}

export const aiAlertsRepository = {
  findDeployedModelThreshold() {
    return prisma.ai_model_versions.findFirst({
      where: { status: 'DEPLOYED' },
      orderBy: [{ deployed_at: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        model_name: true,
        version: true,
        status: true,
        parameters: true,
        deployed_at: true,
      },
    });
  },
  async configureDeployedModelThreshold(input: {
    modelVersionId: string;
    threshold: number;
    actorUserId: string;
  }) {
    return prisma.$transaction(async (transaction) => {
      const model = await transaction.ai_model_versions.findFirst({
        where: { id: input.modelVersionId, status: 'DEPLOYED' },
        select: {
          id: true,
          model_name: true,
          version: true,
          status: true,
          parameters: true,
          deployed_at: true,
        },
      });
      if (!model) return null;
      const current =
        model.parameters && typeof model.parameters === 'object' && !Array.isArray(model.parameters)
          ? model.parameters
          : {};
      const updated = await transaction.ai_model_versions.update({
        where: { id: model.id },
        data: { parameters: { ...current, threshold: input.threshold } },
        select: {
          id: true,
          model_name: true,
          version: true,
          status: true,
          parameters: true,
          deployed_at: true,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: input.actorUserId,
          actor_type: 'USER',
          action: 'CONFIGURE_DETECTION_THRESHOLD',
          resource_type: 'AI_MODEL_VERSION',
          resource_id: model.id,
          source: 'API',
          after_data: { threshold: input.threshold },
          record_hash: `${model.id}:${input.threshold}:${input.actorUserId}`,
        },
      });
      return updated;
    });
  },
  listModelVersions(query: ListModelVersionsQuery) {
    const where: Prisma.ai_model_versionsWhereInput = {
      ...(query.modelName
        ? { model_name: { contains: query.modelName, mode: 'insensitive' } }
        : {}),
      ...(query.status ? { status: query.status.toUpperCase() as model_status } : {}),
    };
    const select = {
      id: true,
      model_name: true,
      model_type: true,
      version: true,
      status: true,
      feature_definition: true,
      parameters: true,
      deployed_at: true,
      retired_at: true,
      created_at: true,
      ai_datasets: { select: { id: true, name: true, version: true } },
      ai_model_evaluations: {
        orderBy: [{ evaluated_at: 'desc' as const }, { id: 'desc' as const }],
        take: 1,
        select: {
          id: true,
          precision: true,
          recall: true,
          f1_score: true,
          pr_auc: true,
          false_positive_rate: true,
          alerts_per_day: true,
          detection_latency_ms: true,
          evaluation_notes: true,
          evaluated_at: true,
        },
      },
    } satisfies Prisma.ai_model_versionsSelect;
    return prisma.$transaction([
      prisma.ai_model_versions.count({ where }),
      prisma.ai_model_versions.findMany({
        where,
        select,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },
  async listAlertThresholds(query: ListAlertThresholdsQuery) {
    const model = await prisma.ai_model_versions.findFirst({
      where: { status: 'DEPLOYED' },
      orderBy: [{ deployed_at: 'desc' }, { created_at: 'desc' }],
      select: { parameters: true },
    });
    const thresholds = readThresholdMap(model?.parameters);
    const assetIds = Object.keys(thresholds);
    const where: Prisma.assetsWhereInput = {
      id: { in: assetIds },
      ...(query.q
        ? {
            OR: [
              { asset_code: { contains: query.q, mode: 'insensitive' as const } },
              { name: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    return prisma
      .$transaction([
        prisma.assets.count({ where }),
        prisma.assets.findMany({
          where,
          select: { id: true, asset_code: true, name: true },
          orderBy: [{ asset_code: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ])
      .then(
        ([total, assets]) =>
          [total, assets.map((asset) => ({ asset, configuration: thresholds[asset.id] }))] as const,
      );
  },
  async setAlertThreshold(assetId: string, userId: string, input: SetAlertThresholdBody) {
    return prisma.$transaction(
      async (transaction) => {
        const [asset, model] = await Promise.all([
          transaction.assets.findFirst({
            where: { id: assetId, status: 'ACTIVE' },
            select: { id: true, asset_code: true, name: true },
          }),
          transaction.ai_model_versions.findFirst({
            where: { status: 'DEPLOYED' },
            orderBy: [{ deployed_at: 'desc' }, { created_at: 'desc' }],
            select: { id: true, parameters: true },
          }),
        ]);
        if (!asset) return { outcome: 'asset_not_found' as const };
        if (!model) return { outcome: 'model_not_found' as const };
        const updatedAt = new Date().toISOString();
        const configuration = {
          threshold: input.threshold,
          riskLevelMin: input.riskLevelMin,
          enabled: input.enabled,
          updatedByUserId: userId,
          updatedAt,
        } satisfies Prisma.InputJsonObject;
        const parameters = readParameters(model.parameters);
        const thresholds = readThresholdMap(model.parameters);
        await transaction.ai_model_versions.update({
          where: { id: model.id },
          data: {
            parameters: {
              ...parameters,
              assetThresholds: { ...thresholds, [assetId]: configuration },
            },
          },
        });
        return { outcome: 'saved' as const, asset, configuration };
      },
      { isolationLevel: 'Serializable' },
    );
  },
  metrics(detectedAfter: Date) {
    return prisma.anomaly_alerts.groupBy({
      by: ['status'],
      where: { anomaly_detections: { detected_at: { gt: detectedAfter } } },
      _count: { _all: true },
    });
  },
  list(query: ListAiAlertsQuery) {
    const statuses = databaseStatuses(query.status);
    const where: Prisma.anomaly_alertsWhereInput = {
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(query.detectedAfter
        ? { anomaly_detections: { detected_at: { gt: query.detectedAfter } } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { severity: { contains: query.q, mode: 'insensitive' } },
              {
                anomaly_detections: {
                  normalized_events: { event_type: { contains: query.q, mode: 'insensitive' } },
                },
              },
              {
                anomaly_detections: {
                  normalized_events: {
                    event_sources: { name: { contains: query.q, mode: 'insensitive' } },
                  },
                },
              },
              {
                anomaly_detections: {
                  ai_model_versions: { model_name: { contains: query.q, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.anomaly_alerts.count({ where }),
      prisma.anomaly_alerts.findMany({
        where,
        select: alertSelect,
        orderBy: [{ generated_at: query.sortOrder }, { id: query.sortOrder }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },
  findExplanation(alertId: string) {
    return prisma.anomaly_alerts.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        severity: true,
        created_at: true,
        anomaly_detections: {
          select: {
            id: true,
            anomaly_score: true,
            threshold: true,
            detected_at: true,
            anomaly_feature_contributions: {
              orderBy: [{ rank: 'asc' }, { contribution_score: 'desc' }],
              select: {
                feature_name: true,
                feature_value: true,
                contribution_score: true,
                rank: true,
              },
            },
          },
        },
      },
    });
  },
  findForFeedback(alertId: string) {
    return prisma.anomaly_alerts.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        anomaly_detections: { select: { model_version_id: true } },
      },
    });
  },
  createFeedback(input: {
    alertId: string;
    analystUserId: string;
    decision: triage_decision;
    reason: string;
    modelVersionId: string;
  }) {
    const now = new Date();
    return prisma.alert_triage_records.create({
      data: {
        alert_id: input.alertId,
        analyst_user_id: input.analystUserId,
        decision: input.decision,
        reason: input.reason,
        model_version_id: input.modelVersionId,
        started_at: now,
        completed_at: now,
      },
      select: {
        id: true,
        alert_id: true,
        analyst_user_id: true,
        decision: true,
        reason: true,
        created_at: true,
      },
    });
  },
  listFeedback(alertId: string, query: ListAiAlertFeedbackQuery) {
    const where = { alert_id: alertId };
    return prisma.$transaction([
      prisma.alert_triage_records.count({ where }),
      prisma.alert_triage_records.findMany({
        where,
        orderBy: [{ created_at: query.sortOrder }, { id: query.sortOrder }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          alert_id: true,
          analyst_user_id: true,
          decision: true,
          reason: true,
          created_at: true,
        },
      }),
    ]);
  },
  confirmAsIncident(input: { alertId: string; userId: string; comment?: string }) {
    return prisma.$transaction(async (transaction) => {
      const alert = await transaction.anomaly_alerts.findUnique({
        where: { id: input.alertId },
        select: {
          id: true,
          severity: true,
          status: true,
          anomaly_detections: {
            select: {
              model_version_id: true,
              detected_at: true,
              normalized_events: { select: { event_type: true } },
            },
          },
          security_findings: {
            select: {
              incidents: {
                select: { id: true, incident_code: true, status: true, confirmed_at: true },
              },
            },
          },
        },
      });
      if (!alert) return null;
      const existingIncident = alert.security_findings?.incidents;
      if (existingIncident) return { alert, incident: existingIncident, changed: false };

      const now = new Date();
      const eventTitle = alert.anomaly_detections.normalized_events.event_type
        .replaceAll('_', ' ')
        .replace(/^./, (value) => value.toUpperCase());
      const triage = await transaction.alert_triage_records.create({
        data: {
          alert_id: alert.id,
          analyst_user_id: input.userId,
          decision: 'VALID_ANOMALY',
          reason: input.comment || 'Confirmed as a security incident',
          model_version_id: alert.anomaly_detections.model_version_id,
          started_at: now,
          completed_at: now,
        },
        select: { id: true },
      });
      const finding = await transaction.security_findings.create({
        data: {
          alert_id: alert.id,
          triage_record_id: triage.id,
          title: eventTitle,
          description: input.comment || `${eventTitle} confirmed from an AI-generated alert.`,
          severity: alert.severity,
          status: 'OPEN',
          identified_by: input.userId,
          identified_at: now,
        },
        select: { id: true },
      });
      const incident = await transaction.incidents.create({
        data: {
          incident_code: `INC-${alert.id.replaceAll('-', '').slice(0, 16).toUpperCase()}`,
          finding_id: finding.id,
          title: eventTitle,
          description: input.comment || `${eventTitle} confirmed from an AI-generated alert.`,
          severity: alert.severity || 'MEDIUM',
          status: 'OPEN',
          detected_at: alert.anomaly_detections.detected_at,
          confirmed_at: now,
          created_by: input.userId,
        },
        select: { id: true, incident_code: true, status: true, confirmed_at: true },
      });
      await transaction.anomaly_alerts.update({
        where: { id: alert.id },
        data: { status: 'CONFIRMED', assigned_to: input.userId },
      });
      return { alert, incident, changed: true };
    });
  },
  markFalsePositive(input: { alertId: string; userId: string; comment?: string }) {
    return prisma.$transaction(async (transaction) => {
      const alert = await transaction.anomaly_alerts.findUnique({
        where: { id: input.alertId },
        select: {
          id: true,
          status: true,
          security_findings: { select: { id: true } },
          anomaly_detections: { select: { model_version_id: true } },
          alert_triage_records: {
            where: { decision: 'FALSE_POSITIVE' },
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { analyst_user_id: true, completed_at: true, created_at: true },
          },
        },
      });
      if (!alert) return { outcome: 'not_found' as const };
      if (alert.status === 'CONFIRMED' || alert.security_findings)
        return { outcome: 'confirmed' as const };
      const existing = alert.alert_triage_records[0];
      if (alert.status === 'DISMISSED' && existing) {
        return { outcome: 'unchanged' as const, alert, triage: existing };
      }
      const now = new Date();
      const triage = await transaction.alert_triage_records.create({
        data: {
          alert_id: alert.id,
          analyst_user_id: input.userId,
          decision: 'FALSE_POSITIVE',
          reason: input.comment || 'Marked as false positive',
          model_version_id: alert.anomaly_detections.model_version_id,
          started_at: now,
          completed_at: now,
        },
        select: { analyst_user_id: true, completed_at: true, created_at: true },
      });
      await transaction.anomaly_alerts.update({
        where: { id: alert.id },
        data: { status: 'DISMISSED', assigned_to: input.userId },
      });
      return { outcome: 'changed' as const, alert, triage };
    });
  },
};
