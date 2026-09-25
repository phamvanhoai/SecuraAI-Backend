import type { Prisma, alert_status, triage_decision } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAiAlertsQuery } from './dto/list-ai-alerts.dto.js';
import type { ListAiAlertFeedbackQuery } from './dto/ai-alert-feedback.dto.js';

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

export const aiAlertsRepository = {
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
