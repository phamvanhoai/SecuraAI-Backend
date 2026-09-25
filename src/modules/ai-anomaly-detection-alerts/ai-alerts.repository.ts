import type { Prisma, alert_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAiAlertsQuery } from './dto/list-ai-alerts.dto.js';

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
};
