import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/common/errors/app-error.js';
import { securityDashboardRepository } from '../src/modules/audit-security-reporting/security-dashboard.repository.js';
import { securityDashboardService } from '../src/modules/audit-security-reporting/security-dashboard.service.js';

vi.mock('../src/modules/audit-security-reporting/security-dashboard.repository.js', () => ({
  securityDashboardRepository: {
    findActor: vi.fn(),
    getSecurityIndicators: vi.fn(),
    getRiskMetrics: vi.fn(),
    getIncidentStatistics: vi.fn(),
    getAnomalyAlertMetrics: vi.fn(),
    getOperationalDetails: vi.fn(),
    getOpenFindingsCount: vi.fn(),
  },
}));

describe('Security Dashboard Service', () => {
  const securityOfficerId = '11111111-1111-1111-1111-111111111111';
  const executiveId = '22222222-2222-2222-2222-222222222222';
  const employeeId = '33333333-3333-3333-3333-333333333333';
  const adminId = '44444444-4444-4444-4444-444444444444';

  const mockIndicators = {
    totalAssets: 100,
    criticalAssets: 15,
    activeEventSources: 3,
    totalSecurityControls: 50,
  };

  const mockRiskMetrics = {
    totalRisks: 30,
    openRisks: 10,
    criticalRisks: 2,
    highRisks: 4,
    mediumRisks: 3,
    lowRisks: 1,
    pendingReassessments: 1,
    riskDistribution: [
      { rating: 'CRITICAL' as const, count: 2, percentage: 20 },
      { rating: 'HIGH' as const, count: 4, percentage: 40 },
      { rating: 'MEDIUM' as const, count: 3, percentage: 30 },
      { rating: 'LOW' as const, count: 1, percentage: 10 },
    ],
  };

  const mockIncidentStats = {
    totalIncidents: 12,
    openIncidents: 2,
    inProgressIncidents: 1,
    resolvedIncidents: 9,
    criticalIncidents: 1,
  };

  const mockAlertMetrics = {
    totalEvents24h: 12500,
    totalAlerts24h: 5,
    newAlerts24h: 2,
    reviewingAlerts24h: 1,
    confirmedIncidents24h: 1,
  };

  const mockOperationalDetails = {
    recentAlerts: [
      {
        id: 'aaaa1111-1111-4111-8111-111111111111',
        severity: 'HIGH',
        status: 'NEW',
        detectionType: 'BRUTE_FORCE',
        generatedAt: '2026-10-13T12:00:00.000Z',
      },
    ],
    recentIncidents: [
      {
        id: 'bbbb2222-2222-4222-8222-222222222222',
        incidentCode: 'INC-001',
        title: 'Suspicious logon',
        severity: 'HIGH',
        status: 'OPEN',
        detectedAt: '2026-10-13T11:00:00.000Z',
      },
    ],
    highRiskAssets: [
      {
        id: 'cccc3333-3333-4333-8333-333333333333',
        assetCode: 'AST-01',
        name: 'Database Cluster',
        criticality: 'CRITICAL',
        status: 'ACTIVE',
        openRisksCount: 2,
        activeIncidentsCount: 1,
      },
    ],
    openControlWeaknessesCount: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(securityDashboardRepository.getSecurityIndicators).mockResolvedValue(mockIndicators);
    vi.mocked(securityDashboardRepository.getRiskMetrics).mockResolvedValue(mockRiskMetrics);
    vi.mocked(securityDashboardRepository.getIncidentStatistics).mockResolvedValue(mockIncidentStats);
    vi.mocked(securityDashboardRepository.getAnomalyAlertMetrics).mockResolvedValue(mockAlertMetrics);
    vi.mocked(securityDashboardRepository.getOperationalDetails).mockResolvedValue(mockOperationalDetails as any);
    vi.mocked(securityDashboardRepository.getOpenFindingsCount).mockResolvedValue(2);
  });

  it('rejects unauthenticated or non-active users with 401', async () => {
    vi.mocked(securityDashboardRepository.findActor).mockResolvedValue(null);
    await expect(securityDashboardService.getDashboard('unknown-user')).rejects.toThrowError(
      new AppError(401, 'UNAUTHORIZED', 'Authentication required'),
    );

    vi.mocked(securityDashboardRepository.findActor).mockResolvedValue({
      id: 'inactive-user',
      role: 'SECURITY_OFFICER' as any,
      status: 'INACTIVE' as any,
    });
    await expect(securityDashboardService.getDashboard('inactive-user')).rejects.toThrowError(
      new AppError(401, 'UNAUTHORIZED', 'Authentication required'),
    );
  });

  it('rejects unauthorized roles like EMPLOYEE and ADMIN with 403', async () => {
    vi.mocked(securityDashboardRepository.findActor).mockResolvedValue({
      id: employeeId,
      role: 'EMPLOYEE' as any,
      status: 'ACTIVE' as any,
    });

    await expect(securityDashboardService.getDashboard(employeeId)).rejects.toThrowError(
      new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required'),
    );

    vi.mocked(securityDashboardRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN' as any,
      status: 'ACTIVE' as any,
    });

    await expect(securityDashboardService.getDashboard(adminId)).rejects.toThrowError(
      new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required'),
    );
  });

  it('returns operational details for Security Officer and excludes executive summary', async () => {
    vi.mocked(securityDashboardRepository.findActor).mockResolvedValue({
      id: securityOfficerId,
      role: 'SECURITY_OFFICER' as any,
      status: 'ACTIVE' as any,
    });

    const result = await securityDashboardService.getDashboard(securityOfficerId);

    expect(result.userRole).toBe('SECURITY_OFFICER');
    expect(result.securityIndicators.totalAssets).toBe(100);
    expect(result.operationalDetails).toBeDefined();
    expect(result.operationalDetails?.recentAlerts).toHaveLength(1);
    expect(result.executiveSummary).toBeUndefined();
  });

  it('returns executive summary for Executive and excludes operational details', async () => {
    vi.mocked(securityDashboardRepository.findActor).mockResolvedValue({
      id: executiveId,
      role: 'EXECUTIVE' as any,
      status: 'ACTIVE' as any,
    });

    const result = await securityDashboardService.getDashboard(executiveId);

    expect(result.userRole).toBe('EXECUTIVE');
    expect(result.executiveSummary).toBeDefined();
    expect(result.executiveSummary?.postureScore).toBeGreaterThanOrEqual(0);
    expect(result.executiveSummary?.postureScore).toBeLessThanOrEqual(100);
    expect(result.operationalDetails).toBeUndefined();
  });
});
