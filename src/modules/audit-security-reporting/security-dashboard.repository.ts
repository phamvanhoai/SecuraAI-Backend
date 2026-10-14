import { prisma } from '../../database/prisma.js';

export const securityDashboardRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  async getSecurityIndicators() {
    const [totalAssets, criticalAssets, activeEventSources, totalSecurityControls] =
      await Promise.all([
        prisma.assets.count({ where: { archived_at: null } }),
        prisma.assets.count({
          where: { archived_at: null, criticality: { in: ['CRITICAL', 'HIGH'] } },
        }),
        prisma.event_sources.count({ where: { status: 'ACTIVE' } }),
        prisma.security_controls.count(),
      ]);

    return {
      totalAssets,
      criticalAssets,
      activeEventSources,
      totalSecurityControls,
    };
  },

  async getRiskMetrics() {
    const [totalRisks, openRisks, pendingReassessments, ratingGroups] = await Promise.all([
      prisma.risks.count(),
      prisma.risks.count({ where: { status: { in: ['OPEN', 'UNDER_TREATMENT'] } } }),
      prisma.risk_reassessment_requests.count({ where: { status: 'PENDING' } }),
      prisma.risk_assessments.groupBy({
        by: ['residual_rating'],
        _count: { id: true },
        where: { residual_rating: { not: null } },
      }),
    ]);

    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const group of ratingGroups) {
      const count = group._count.id;
      switch (group.residual_rating) {
        case 'CRITICAL':
          critical += count;
          break;
        case 'HIGH':
          high += count;
          break;
        case 'MEDIUM':
          medium += count;
          break;
        case 'LOW':
          low += count;
          break;
      }
    }

    const assessedTotal = critical + high + medium + low;
    const calculatePct = (count: number) =>
      assessedTotal > 0 ? Math.round((count / assessedTotal) * 1000) / 10 : 0;

    return {
      totalRisks,
      openRisks,
      criticalRisks: critical,
      highRisks: high,
      mediumRisks: medium,
      lowRisks: low,
      pendingReassessments,
      riskDistribution: [
        { rating: 'CRITICAL' as const, count: critical, percentage: calculatePct(critical) },
        { rating: 'HIGH' as const, count: high, percentage: calculatePct(high) },
        { rating: 'MEDIUM' as const, count: medium, percentage: calculatePct(medium) },
        { rating: 'LOW' as const, count: low, percentage: calculatePct(low) },
      ],
    };
  },

  async getIncidentStatistics() {
    const [totalIncidents, openIncidents, inProgressIncidents, resolvedIncidents, criticalIncidents] =
      await Promise.all([
        prisma.incidents.count(),
        prisma.incidents.count({ where: { status: 'OPEN' } }),
        prisma.incidents.count({
          where: { status: { in: ['TRIAGE', 'CONTAINMENT', 'ERADICATION', 'RECOVERY'] } },
        }),
        prisma.incidents.count({
          where: { status: { in: ['CLOSED', 'LESSONS_LEARNED'] } },
        }),
        prisma.incidents.count({
          where: { severity: { in: ['CRITICAL', 'Critical', 'critical'] } },
        }),
      ]);

    return {
      totalIncidents,
      openIncidents,
      inProgressIncidents,
      resolvedIncidents,
      criticalIncidents,
    };
  },

  async getAnomalyAlertMetrics() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalEvents24h,
      totalAlerts24h,
      newAlerts24h,
      reviewingAlerts24h,
      confirmedIncidents24h,
    ] = await Promise.all([
      prisma.normalized_events.count({ where: { ingested_at: { gte: since24h } } }),
      prisma.anomaly_alerts.count({ where: { generated_at: { gte: since24h } } }),
      prisma.anomaly_alerts.count({
        where: { generated_at: { gte: since24h }, status: 'NEW' },
      }),
      prisma.anomaly_alerts.count({
        where: { generated_at: { gte: since24h }, status: { in: ['IN_TRIAGE', 'NEED_INVESTIGATION'] } },
      }),
      prisma.anomaly_alerts.count({
        where: { generated_at: { gte: since24h }, status: 'CONFIRMED' },
      }),
    ]);

    return {
      totalEvents24h,
      totalAlerts24h,
      newAlerts24h,
      reviewingAlerts24h,
      confirmedIncidents24h,
    };
  },

  async getOperationalDetails() {
    const [recentAlertsRaw, recentIncidentsRaw, highRiskAssetsRaw, openControlWeaknessesCount] =
      await Promise.all([
        prisma.anomaly_alerts.findMany({
          take: 5,
          orderBy: { generated_at: 'desc' },
          select: {
            id: true,
            severity: true,
            status: true,
            generated_at: true,
            anomaly_detections: {
              select: {
                normalized_events: {
                  select: { event_type: true },
                },
              },
            },
          },
        }),
        prisma.incidents.findMany({
          take: 5,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            incident_code: true,
            title: true,
            severity: true,
            status: true,
            detected_at: true,
          },
        }),
        prisma.assets.findMany({
          take: 5,
          where: { archived_at: null, criticality: { in: ['CRITICAL', 'HIGH'] } },
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            asset_code: true,
            name: true,
            criticality: true,
            status: true,
            _count: {
              select: {
                risk_assets: true,
                incident_assets: true,
              },
            },
          },
        }),
        prisma.control_findings.count({
          where: { status: 'OPEN' },
        }),
      ]);

    const recentAlerts = recentAlertsRaw.map((a) => ({
      id: a.id,
      severity: a.severity || 'MEDIUM',
      status: String(a.status),
      detectionType: a.anomaly_detections?.normalized_events?.event_type,
      generatedAt: a.generated_at.toISOString(),
    }));

    const recentIncidents = recentIncidentsRaw.map((inc) => ({
      id: inc.id,
      incidentCode: inc.incident_code,
      title: inc.title,
      severity: inc.severity,
      status: String(inc.status),
      detectedAt: inc.detected_at ? inc.detected_at.toISOString() : null,
    }));

    const highRiskAssets = highRiskAssetsRaw.map((asset) => ({
      id: asset.id,
      assetCode: asset.asset_code,
      name: asset.name,
      criticality: asset.criticality || 'HIGH',
      status: String(asset.status),
      openRisksCount: asset._count?.risk_assets ?? 0,
      activeIncidentsCount: asset._count?.incident_assets ?? 0,
    }));

    return {
      recentAlerts,
      recentIncidents,
      highRiskAssets,
      openControlWeaknessesCount,
    };
  },

  async getOpenFindingsCount() {
    return prisma.control_findings.count({
      where: { status: 'OPEN' },
    });
  },
};
