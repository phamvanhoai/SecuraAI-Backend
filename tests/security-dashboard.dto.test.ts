import { describe, expect, it } from 'vitest';
import {
  securityDashboardResponseSchema,
  riskMetricsSchema,
  securityIndicatorsSchema,
  incidentStatisticsSchema,
  anomalyAlertMetricsSchema,
} from '../src/modules/audit-security-reporting/dto/get-security-dashboard.dto.js';

describe('Security Dashboard DTO Validation', () => {
  it('validates correct Security Indicators schema', () => {
    const validIndicators = {
      totalAssets: 45,
      criticalAssets: 12,
      activeEventSources: 3,
      totalSecurityControls: 114,
    };
    expect(() => securityIndicatorsSchema.parse(validIndicators)).not.toThrow();
  });

  it('fails Security Indicators with negative counts', () => {
    const invalidIndicators = {
      totalAssets: -5,
      criticalAssets: 12,
      activeEventSources: 3,
      totalSecurityControls: 114,
    };
    expect(() => securityIndicatorsSchema.parse(invalidIndicators)).toThrow();
  });

  it('validates complete Security Dashboard response for Security Officer with operational details', () => {
    const validDashboard = {
      userRole: 'SECURITY_OFFICER' as const,
      securityIndicators: {
        totalAssets: 1248,
        criticalAssets: 156,
        activeEventSources: 4,
        totalSecurityControls: 93,
      },
      riskMetrics: {
        totalRisks: 156,
        openRisks: 42,
        criticalRisks: 5,
        highRisks: 12,
        mediumRisks: 20,
        lowRisks: 5,
        pendingReassessments: 2,
        riskDistribution: [
          { rating: 'CRITICAL' as const, count: 5, percentage: 11.9 },
          { rating: 'HIGH' as const, count: 12, percentage: 28.6 },
          { rating: 'MEDIUM' as const, count: 20, percentage: 47.6 },
          { rating: 'LOW' as const, count: 5, percentage: 11.9 },
        ],
      },
      incidentStatistics: {
        totalIncidents: 28,
        openIncidents: 6,
        inProgressIncidents: 4,
        resolvedIncidents: 18,
        criticalIncidents: 2,
      },
      aiAlertMetrics: {
        totalEvents24h: 15420,
        totalAlerts24h: 12,
        newAlerts24h: 7,
        reviewingAlerts24h: 3,
        confirmedIncidents24h: 2,
      },
      operationalDetails: {
        recentAlerts: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            severity: 'HIGH',
            status: 'NEW',
            detectionType: 'PORT_SCAN',
            generatedAt: '2026-10-13T10:00:00.000Z',
          },
        ],
        recentIncidents: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            incidentCode: 'INC-2026-001',
            title: 'Unauthorized SSH access',
            severity: 'HIGH',
            status: 'IN_PROGRESS',
            detectedAt: '2026-10-13T08:00:00.000Z',
          },
        ],
        highRiskAssets: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            assetCode: 'AST-PROD-DB01',
            name: 'Primary Database',
            criticality: 'CRITICAL',
            status: 'ACTIVE',
            openRisksCount: 2,
            activeIncidentsCount: 1,
          },
        ],
        openControlWeaknessesCount: 4,
      },
    };

    const parsed = securityDashboardResponseSchema.parse(validDashboard);
    expect(parsed.userRole).toBe('SECURITY_OFFICER');
    expect(parsed.operationalDetails?.recentAlerts).toHaveLength(1);
    expect(parsed.operationalDetails?.highRiskAssets[0]?.openRisksCount).toBe(2);
    expect(parsed.executiveSummary).toBeUndefined();
  });

  it('validates complete Security Dashboard response for Executive with executive summary', () => {
    const validExecutiveDashboard = {
      userRole: 'EXECUTIVE' as const,
      securityIndicators: {
        totalAssets: 1248,
        criticalAssets: 156,
        activeEventSources: 4,
        totalSecurityControls: 93,
      },
      riskMetrics: {
        totalRisks: 156,
        openRisks: 42,
        criticalRisks: 5,
        highRisks: 12,
        mediumRisks: 20,
        lowRisks: 5,
        pendingReassessments: 2,
        riskDistribution: [],
      },
      incidentStatistics: {
        totalIncidents: 28,
        openIncidents: 6,
        inProgressIncidents: 4,
        resolvedIncidents: 18,
        criticalIncidents: 2,
      },
      aiAlertMetrics: {
        totalEvents24h: 15420,
        totalAlerts24h: 12,
        newAlerts24h: 7,
        reviewingAlerts24h: 3,
        confirmedIncidents24h: 2,
      },
      executiveSummary: {
        postureScore: 82,
        postureLevel: 'ADEQUATE' as const,
        complianceRate: 88,
        strategicHighlights: ['Posture score is 82/100'],
      },
    };

    const parsed = securityDashboardResponseSchema.parse(validExecutiveDashboard);
    expect(parsed.userRole).toBe('EXECUTIVE');
    expect(parsed.executiveSummary?.postureScore).toBe(82);
    expect(parsed.operationalDetails).toBeUndefined();
  });
});
