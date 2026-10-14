import { AppError } from '../../common/errors/app-error.js';
import type {
  ExecutiveSummary,
  OperationalDetails,
  SecurityDashboardResponse,
} from './dto/get-security-dashboard.dto.js';
import { securityDashboardRepository } from './security-dashboard.repository.js';

export const securityDashboardService = {
  async getDashboard(userId: string): Promise<SecurityDashboardResponse> {
    const actor = await securityDashboardRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const [indicators, riskMetrics, incidentStats, alertMetrics, openFindingsCount] =
      await Promise.all([
        securityDashboardRepository.getSecurityIndicators(),
        securityDashboardRepository.getRiskMetrics(),
        securityDashboardRepository.getIncidentStatistics(),
        securityDashboardRepository.getAnomalyAlertMetrics(),
        securityDashboardRepository.getOpenFindingsCount(),
      ]);

    let operationalDetails: OperationalDetails | undefined = undefined;
    let executiveSummary: ExecutiveSummary | undefined = undefined;

    // Security Officer receives granular operational details
    if (actor.role === 'SECURITY_OFFICER') {
      operationalDetails = await securityDashboardRepository.getOperationalDetails();
    }

    // Executive receives strategic executive summary KPIs
    if (actor.role === 'EXECUTIVE') {
      const controls = indicators.totalSecurityControls;
      const complianceRate =
        controls > 0
          ? Math.max(0, Math.min(100, Math.round(((controls - openFindingsCount) / controls) * 100)))
          : 100;

      // Calculate weighted security posture health score (0 - 100)
      const incidentDeduction = Math.min(40, incidentStats.criticalIncidents * 15 + incidentStats.openIncidents * 5);
      const riskDeduction = Math.min(30, riskMetrics.criticalRisks * 8 + riskMetrics.highRisks * 4);
      const findingDeduction = Math.min(20, openFindingsCount * 3);
      const alertDeduction = Math.min(10, alertMetrics.newAlerts24h * 2);

      const computedScore = Math.max(
        0,
        Math.min(100, 100 - (incidentDeduction + riskDeduction + findingDeduction + alertDeduction)),
      );

      let postureLevel: ExecutiveSummary['postureLevel'] = 'STRONG';
      if (computedScore < 50) {
        postureLevel = 'CRITICAL';
      } else if (computedScore < 70) {
        postureLevel = 'NEEDS_ATTENTION';
      } else if (computedScore < 85) {
        postureLevel = 'ADEQUATE';
      }

      const strategicHighlights: string[] = [
        `Overall security posture is rated as ${postureLevel} (${computedScore}/100) across ${indicators.totalAssets} monitored IT assets.`,
        `${incidentStats.openIncidents} active incidents currently open, with ${incidentStats.criticalIncidents} marked as critical severity.`,
        `${riskMetrics.openRisks} operational risks identified, including ${riskMetrics.criticalRisks} critical and ${riskMetrics.highRisks} high risk items.`,
        `${alertMetrics.totalAlerts24h} AI-detected anomaly alerts triggered in the last 24 hours (${alertMetrics.confirmedIncidents24h} confirmed as incidents).`,
      ];

      executiveSummary = {
        postureScore: computedScore,
        postureLevel,
        complianceRate,
        strategicHighlights,
      };
    }

    return {
      userRole: actor.role as 'SECURITY_OFFICER' | 'EXECUTIVE',
      securityIndicators: indicators,
      riskMetrics,
      incidentStatistics: incidentStats,
      aiAlertMetrics: alertMetrics,
      ...(operationalDetails ? { operationalDetails } : {}),
      ...(executiveSummary ? { executiveSummary } : {}),
    };
  },
};
