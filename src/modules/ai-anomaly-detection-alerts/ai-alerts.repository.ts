import { createHash } from 'node:crypto';
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
      anomaly_feature_contributions: {
        where: { feature_name: 'alert_score_update' },
        select: { feature_name: true, feature_value: true },
      },
      detected_at: true,
      ai_model_versions: {
        select: { id: true, model_name: true, model_type: true, version: true },
      },
      normalized_events: {
        select: {
          id: true,
          external_event_id: true,
          event_family: true,
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

// Translate public filter names to the database alert-status enum.
function databaseStatuses(status: ListAiAlertsQuery['status']): alert_status[] | undefined {
  if (!status) return undefined;
  if (status === 'new') return ['NEW'];
  if (status === 'reviewing') return ['IN_TRIAGE'];
  if (status === 'needs_investigation') return ['NEED_INVESTIGATION'];
  if (status === 'confirmed') return ['CONFIRMED'];
  if (status === 'dismissed' || status === 'false_positive' || status === 'resolved')
    return ['DISMISSED'];
  return undefined;
}

// Read model parameters as a JSON object without trusting other JSON shapes.
function readParameters(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Preserve current model settings while removing retired backend scoring weights.
function currentDetectionParameters(
  value: Prisma.JsonValue | null | undefined,
): Prisma.JsonObject {
  const parameters = { ...readParameters(value) };
  delete parameters.weights;
  return parameters;
}

// Extract valid asset-threshold entries from deployed-model parameters.
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

// Read the previous audit hash used to extend the tamper-evident chain.
async function latestAuditHash(transaction: Prisma.TransactionClient): Promise<string | null> {
  const previous = await transaction.audit_logs.findFirst({
    orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    select: { record_hash: true },
  });
  return previous?.record_hash ?? null;
}

// Produce the deterministic hash stored with a new audit record.
export function hashAuditRecord(input: {
  previousHash: string | null;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  source: string;
  sourceIp?: string | null;
  userAgent?: string | null;
  beforeData?: Prisma.InputJsonValue | null;
  afterData?: Prisma.InputJsonValue | null;
  occurredAt: Date;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        previousHash: input.previousHash,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        source: input.source,
        sourceIp: input.sourceIp ?? null,
        userAgent: input.userAgent ?? null,
        beforeData: input.beforeData ?? null,
        afterData: input.afterData ?? null,
        occurredAt: input.occurredAt.toISOString(),
      }),
    )
    .digest('hex');
}

export const aiAlertsRepository = {
  // Claim a NEW alert for one analyst. The transaction prevents two analysts
  // from starting triage on the same alert at the same time.
  async startTriage(input: { alertId: string; analystUserId: string }) {
    return prisma.$transaction(async (transaction) => {
      const startedAt = new Date();
      const claimed = await transaction.anomaly_alerts.updateMany({
        where: { id: input.alertId, status: 'NEW', assigned_to: null },
        data: {
          status: 'IN_TRIAGE',
          assigned_to: input.analystUserId,
          updated_at: startedAt,
        },
      });
      if (claimed.count === 1) {
        const action = 'START_AI_ALERT_TRIAGE';
        const resourceType = 'ANOMALY_ALERT';
        const afterData = { status: 'IN_TRIAGE', assignedTo: input.analystUserId };
        const previousHash = await latestAuditHash(transaction);
        await transaction.audit_logs.create({
          data: {
            actor_user_id: input.analystUserId,
            actor_type: 'USER',
            action,
            resource_type: resourceType,
            resource_id: input.alertId,
            source: 'API',
            occurred_at: startedAt,
            after_data: afterData,
            ...(previousHash ? { previous_hash: previousHash } : {}),
            record_hash: hashAuditRecord({
              previousHash,
              actorUserId: input.analystUserId,
              action,
              resourceType,
              resourceId: input.alertId,
              source: 'API',
              afterData,
              occurredAt: startedAt,
            }),
          },
        });
      }
      const alert = await transaction.anomaly_alerts.findUnique({
        where: { id: input.alertId },
        select: {
          id: true,
          status: true,
          assigned_to: true,
          updated_at: true,
          anomaly_detections: { select: { model_version_id: true } },
        },
      });
      if (!alert) return { outcome: 'not_found' as const };
      if (claimed.count === 1) {
        await transaction.alert_triage_records.create({
          data: {
            alert_id: alert.id,
            analyst_user_id: input.analystUserId,
            decision: 'NEED_INVESTIGATION',
            reason: 'Analyst triage started',
            model_version_id: alert.anomaly_detections.model_version_id,
            started_at: startedAt,
          },
        });
        return { outcome: 'started' as const, alert, startedAt };
      }
      if (alert.status === 'IN_TRIAGE' && alert.assigned_to === input.analystUserId) {
        return { outcome: 'already_started' as const, alert, startedAt: alert.updated_at };
      }
      return { outcome: 'conflict' as const, alert };
    });
  },
  // Query active assets eligible for custom threshold configuration.
  listActiveAssetOptions(q?: string) {
    return prisma.assets.findMany({
      where: {
        status: 'ACTIVE',
        ...(q
          ? {
              OR: [
                { asset_code: { contains: q, mode: 'insensitive' as const } },
                { name: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, asset_code: true, name: true },
      orderBy: [{ asset_code: 'asc' }, { id: 'asc' }],
      take: 50,
    });
  },
  // Read the latest deployed model and its threshold parameters.
  findDeployedModelThreshold() {
    // Find the latest deployed model and return only the fields needed
    // by the service and the API response.
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
  // Update the deployed threshold and append its audit record atomically.
  async configureDeployedModelThreshold(input: {
    modelVersionId: string;
    threshold: number;
    actorUserId: string;
    sourceIp?: string | undefined;
    userAgent?: string | undefined;
  }) {
    // Run the threshold update and audit-log insert as one operation.
    // If either step fails, Prisma rolls back both changes.
    return prisma.$transaction(async (transaction) => {
      // Check again that the selected model is still deployed.
      // This prevents an old request from updating a model that was replaced.
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

      // Keep current model settings, remove retired scoring weights and replace the threshold.
      const current = currentDetectionParameters(model.parameters);
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
      const occurredAt = new Date();
      const action = 'CONFIGURE_DETECTION_THRESHOLD';
      const resourceType = 'AI_MODEL_VERSION';
      const afterData = { threshold: input.threshold };
      const previousHash = await latestAuditHash(transaction);

      // Record who changed the threshold, when it happened, and the client
      // information. This provides a history for security review.
      await transaction.audit_logs.create({
        data: {
          actor_user_id: input.actorUserId,
          actor_type: 'USER',
          action,
          resource_type: resourceType,
          resource_id: model.id,
          source: 'API',
          source_ip: input.sourceIp ?? null,
          user_agent: input.userAgent ?? null,
          occurred_at: occurredAt,
          after_data: afterData,
          ...(previousHash ? { previous_hash: previousHash } : {}),
          record_hash: hashAuditRecord({
            previousHash,
            actorUserId: input.actorUserId,
            action,
            resourceType,
            resourceId: model.id,
            source: 'API',
            sourceIp: input.sourceIp ?? null,
            userAgent: input.userAgent ?? null,
            afterData,
            occurredAt,
          }),
        },
      });
      return updated;
    });
  },
  // Query a filtered and paginated model-version list with evaluation metrics.
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
  // Read one page of asset threshold settings from deployed-model parameters.
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
  // Save or update the threshold for one asset and record the actor.
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
        const parameters = currentDetectionParameters(model.parameters);
        const thresholds = readThresholdMap(model.parameters);
        const existing = thresholds[assetId];
        if (input.mode === 'create' && existing?.enabled === true) {
          return { outcome: 'active_override_exists' as const };
        }
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
  // Group recent alerts by workflow status for dashboard totals.
  metrics(detectedAfter: Date) {
    return prisma.anomaly_alerts.groupBy({
      by: ['status'],
      where: { anomaly_detections: { detected_at: { gt: detectedAfter } } },
      _count: { _all: true },
    });
  },
  // Apply the validated filters and pagination in PostgreSQL, not in the client.
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
                  normalized_events: {
                    OR: [
                      { event_type: { contains: query.q, mode: 'insensitive' } },
                      { external_event_id: { contains: query.q, mode: 'insensitive' } },
                    ],
                  },
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
  // Load only the alert, detection and feature evidence needed by the detail response.
  findExplanation(alertId: string) {
    return prisma.anomaly_alerts.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        severity: true,
        created_at: true,
        explanation_text: true,
        explanation_generated_at: true,
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
  // Load explanation data plus model/event context needed for regeneration.
  findExplanationForRegeneration(alertId: string) {
    return prisma.anomaly_alerts.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        severity: true,
        explanation_text: true,
        explanation_generated_at: true,
        anomaly_detections: {
          select: {
            id: true,
            anomaly_score: true,
            threshold: true,
            detected_at: true,
            model_version_id: true,
            normalized_events: { select: { id: true } },
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
  // Replace explanation text conditionally and record the audited change.
  replaceExplanation(input: {
    alertId: string;
    actorUserId: string;
    reason: string;
    explanationText: string;
    generatedAt: Date;
    modelVersionId: string;
    previousText: string;
    previousGeneratedAt: Date;
    sourceIp?: string | undefined;
    userAgent?: string | undefined;
  }) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.anomaly_alerts.updateMany({
        where: {
          id: input.alertId,
          explanation_generated_at: input.previousGeneratedAt,
        },
        data: {
          explanation_text: input.explanationText,
          explanation_generated_at: input.generatedAt,
          updated_at: input.generatedAt,
        },
      });
      if (updated.count !== 1) return false;
      const action = 'REGENERATE_AI_ALERT_EXPLANATION';
      const resourceType = 'AI_ALERT';
      const beforeData = {
        explanationText: input.previousText,
        generatedAt: input.previousGeneratedAt.toISOString(),
      };
      const afterData = {
        explanationText: input.explanationText,
        generatedAt: input.generatedAt.toISOString(),
        modelVersionId: input.modelVersionId,
        reason: input.reason,
      };
      const previousHash = await latestAuditHash(transaction);
      await transaction.audit_logs.create({
        data: {
          actor_user_id: input.actorUserId,
          actor_type: 'USER',
          action,
          resource_type: resourceType,
          resource_id: input.alertId,
          source: 'API',
          source_ip: input.sourceIp ?? null,
          user_agent: input.userAgent ?? null,
          occurred_at: input.generatedAt,
          before_data: beforeData,
          after_data: afterData,
          ...(previousHash ? { previous_hash: previousHash } : {}),
          record_hash: hashAuditRecord({
            previousHash,
            actorUserId: input.actorUserId,
            action,
            resourceType,
            resourceId: input.alertId,
            source: 'API',
            sourceIp: input.sourceIp ?? null,
            userAgent: input.userAgent ?? null,
            beforeData,
            afterData,
            occurredAt: input.generatedAt,
          }),
        },
      });
      return true;
    });
  },
  // Load the alert state and model version required before feedback creation.
  findForFeedback(alertId: string) {
    return prisma.anomaly_alerts.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        anomaly_detections: { select: { model_version_id: true } },
      },
    });
  },
  // Store analyst feedback with actor, time, reason and model version.
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
        completed_at: true,
        created_at: true,
        users: { select: { id: true, full_name: true, email: true } },
        ai_model_versions: { select: { id: true, model_name: true, version: true } },
      },
    });
  },
  // Query one page of analyst feedback history for an alert.
  listFeedback(alertId: string, query: ListAiAlertFeedbackQuery) {
    const where = { alert_id: alertId };
    return Promise.all([
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
          completed_at: true,
          created_at: true,
          users: { select: { id: true, full_name: true, email: true } },
          ai_model_versions: { select: { id: true, model_name: true, version: true } },
        },
      }),
    ]);
  },
  // Confirm an alert, create its incident and feedback, and audit the transition.
  confirmAsIncident(input: { alertId: string; userId: string; comment?: string }) {
    return prisma.$transaction(async (transaction) => {
      const alert = await transaction.anomaly_alerts.findUnique({
        where: { id: input.alertId },
        select: {
          id: true,
          severity: true,
          status: true,
          assigned_to: true,
          anomaly_detections: {
            select: {
              model_version_id: true,
              detected_at: true,
              normalized_events: { select: { event_type: true } },
            },
          },
          security_findings: {
            select: {
              id: true,
              title: true,
              status: true,
              identified_at: true,
            },
          },
        },
      });
      if (!alert) return { outcome: 'not_found' as const };
      const existingFinding = alert.security_findings;
      if (existingFinding) {
        if (alert.assigned_to !== input.userId) return { outcome: 'not_owner' as const };
        return {
          outcome: 'unchanged' as const,
          alert,
          finding: existingFinding,
          changed: false,
        };
      }
      if (alert.status !== 'IN_TRIAGE' && alert.status !== 'NEED_INVESTIGATION')
        return { outcome: 'invalid_status' as const };
      if (alert.assigned_to !== input.userId) return { outcome: 'not_owner' as const };

      const now = new Date();
      const claimed = await transaction.anomaly_alerts.updateMany({
        where: {
          id: alert.id,
          status: { in: ['IN_TRIAGE', 'NEED_INVESTIGATION'] },
          assigned_to: input.userId,
        },
        data: { status: 'CONFIRMED', updated_at: now },
      });
      if (claimed.count !== 1) return { outcome: 'conflict' as const };
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
        select: { id: true, title: true, status: true, identified_at: true },
      });
      return { outcome: 'confirmed' as const, alert, finding, changed: true };
    });
  },
  // Dismiss an alert and store false-positive feedback in one transaction.
  markFalsePositive(input: { alertId: string; userId: string; comment?: string }) {
    return prisma.$transaction(async (transaction) => {
      const alert = await transaction.anomaly_alerts.findUnique({
        where: { id: input.alertId },
        select: {
          id: true,
          status: true,
          assigned_to: true,
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
        if (alert.assigned_to !== input.userId) return { outcome: 'not_owner' as const };
        return { outcome: 'unchanged' as const, alert, triage: existing };
      }
      if (alert.status !== 'IN_TRIAGE' && alert.status !== 'NEED_INVESTIGATION')
        return { outcome: 'invalid_status' as const };
      if (alert.assigned_to !== input.userId) return { outcome: 'not_owner' as const };
      const now = new Date();
      const claimed = await transaction.anomaly_alerts.updateMany({
        where: {
          id: alert.id,
          status: { in: ['IN_TRIAGE', 'NEED_INVESTIGATION'] },
          assigned_to: input.userId,
        },
        data: { status: 'DISMISSED', updated_at: now },
      });
      if (claimed.count !== 1) return { outcome: 'conflict' as const };
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
      return { outcome: 'changed' as const, alert, triage };
    });
  },
  // Keep an alert open for investigation and record the analyst's reason.
  markFurtherInvestigation(input: { alertId: string; userId: string; reason: string }) {
    return prisma.$transaction(async (transaction) => {
      const alert = await transaction.anomaly_alerts.findUnique({
        where: { id: input.alertId },
        select: {
          id: true,
          status: true,
          assigned_to: true,
          anomaly_detections: { select: { model_version_id: true } },
          alert_triage_records: {
            where: { decision: 'NEED_INVESTIGATION', completed_at: { not: null } },
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { analyst_user_id: true, completed_at: true, created_at: true },
          },
        },
      });
      if (!alert) return { outcome: 'not_found' as const };
      const existing = alert.alert_triage_records[0];
      if (alert.status === 'NEED_INVESTIGATION' && existing) {
        if (alert.assigned_to !== input.userId) return { outcome: 'not_owner' as const };
        return { outcome: 'unchanged' as const, alert, triage: existing };
      }
      if (alert.status !== 'IN_TRIAGE') return { outcome: 'invalid_status' as const };
      if (alert.assigned_to !== input.userId) return { outcome: 'not_owner' as const };

      const now = new Date();
      const claimed = await transaction.anomaly_alerts.updateMany({
        where: { id: alert.id, status: 'IN_TRIAGE', assigned_to: input.userId },
        data: { status: 'NEED_INVESTIGATION', updated_at: now },
      });
      if (claimed.count !== 1) return { outcome: 'conflict' as const };
      const triage = await transaction.alert_triage_records.create({
        data: {
          alert_id: alert.id,
          analyst_user_id: input.userId,
          decision: 'NEED_INVESTIGATION',
          reason: input.reason,
          model_version_id: alert.anomaly_detections.model_version_id,
          started_at: now,
          completed_at: now,
        },
        select: { analyst_user_id: true, completed_at: true, created_at: true },
      });
      const action = 'MARK_AI_ALERT_NEEDS_INVESTIGATION';
      const resourceType = 'ANOMALY_ALERT';
      const beforeData = { status: 'IN_TRIAGE' };
      const afterData = { status: 'NEED_INVESTIGATION', reason: input.reason };
      const previousHash = await latestAuditHash(transaction);
      await transaction.audit_logs.create({
        data: {
          actor_user_id: input.userId,
          actor_type: 'USER',
          action,
          resource_type: resourceType,
          resource_id: alert.id,
          source: 'API',
          occurred_at: now,
          before_data: beforeData,
          after_data: afterData,
          ...(previousHash ? { previous_hash: previousHash } : {}),
          record_hash: hashAuditRecord({
            previousHash,
            actorUserId: input.userId,
            action,
            resourceType,
            resourceId: alert.id,
            source: 'API',
            beforeData,
            afterData,
            occurredAt: now,
          }),
        },
      });
      return { outcome: 'changed' as const, alert, triage };
    });
  },
};
