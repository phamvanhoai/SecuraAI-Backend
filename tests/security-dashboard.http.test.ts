import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { securityDashboardService } from '../src/modules/audit-security-reporting/security-dashboard.service.js';
import { AppError } from '../src/common/errors/app-error.js';

let mockAuthenticatedUserId: string | null = '11111111-1111-1111-1111-111111111111';

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../src/common/middleware/authenticate.js', () => ({
  authenticate: (_req: any, res: any, next: any) => {
    if (!mockAuthenticatedUserId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    res.locals.authenticatedUserId = mockAuthenticatedUserId;
    next();
  },
}));

vi.mock('../src/modules/audit-security-reporting/security-dashboard.service.js', () => ({
  securityDashboardService: {
    getDashboard: vi.fn(),
  },
}));

describe('GET /api/v1/dashboard/security-posture & /api/v1/dashboard HTTP tests', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUserId = '11111111-1111-1111-1111-111111111111';
    vi.mocked(prisma.users.findUnique).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    } as any);
  });

  it('requires authentication and returns 401 when unauthenticated', async () => {
    mockAuthenticatedUserId = null;
    const res = await request(app).get('/api/v1/dashboard/security-posture');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when user does not have authorized role', async () => {
    vi.mocked(prisma.users.findUnique).mockResolvedValue({
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    } as any);

    const res = await request(app).get('/api/v1/dashboard/security-posture');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 with dashboard metrics for Security Officer', async () => {
    const mockData = {
      userRole: 'SECURITY_OFFICER' as const,
      securityIndicators: {
        totalAssets: 120,
        criticalAssets: 20,
        activeEventSources: 5,
        totalSecurityControls: 114,
      },
      riskMetrics: {
        totalRisks: 45,
        openRisks: 15,
        criticalRisks: 3,
        highRisks: 6,
        mediumRisks: 5,
        lowRisks: 1,
        pendingReassessments: 0,
        riskDistribution: [],
      },
      incidentStatistics: {
        totalIncidents: 10,
        openIncidents: 2,
        inProgressIncidents: 1,
        resolvedIncidents: 7,
        criticalIncidents: 1,
      },
      aiAlertMetrics: {
        totalEvents24h: 9800,
        totalAlerts24h: 8,
        newAlerts24h: 4,
        reviewingAlerts24h: 2,
        confirmedIncidents24h: 2,
      },
      operationalDetails: {
        recentAlerts: [],
        recentIncidents: [],
        highRiskAssets: [],
        openControlWeaknessesCount: 1,
      },
    };

    vi.mocked(securityDashboardService.getDashboard).mockResolvedValue(mockData as any);

    const res = await request(app).get('/api/v1/dashboard/security-posture');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userRole).toBe('SECURITY_OFFICER');
    expect(res.body.data.securityIndicators.totalAssets).toBe(120);
    expect(res.body.data.operationalDetails).toBeDefined();
  });

  it('also responds at GET /api/v1/dashboard', async () => {
    const mockData = {
      userRole: 'EXECUTIVE' as const,
      securityIndicators: {
        totalAssets: 120,
        criticalAssets: 20,
        activeEventSources: 5,
        totalSecurityControls: 114,
      },
      riskMetrics: {
        totalRisks: 45,
        openRisks: 15,
        criticalRisks: 3,
        highRisks: 6,
        mediumRisks: 5,
        lowRisks: 1,
        pendingReassessments: 0,
        riskDistribution: [],
      },
      incidentStatistics: {
        totalIncidents: 10,
        openIncidents: 2,
        inProgressIncidents: 1,
        resolvedIncidents: 7,
        criticalIncidents: 1,
      },
      aiAlertMetrics: {
        totalEvents24h: 9800,
        totalAlerts24h: 8,
        newAlerts24h: 4,
        reviewingAlerts24h: 2,
        confirmedIncidents24h: 2,
      },
      executiveSummary: {
        postureScore: 88,
        postureLevel: 'STRONG' as const,
        complianceRate: 92,
        strategicHighlights: ['Strong security posture'],
      },
    };

    vi.mocked(securityDashboardService.getDashboard).mockResolvedValue(mockData as any);

    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userRole).toBe('EXECUTIVE');
  });
});
