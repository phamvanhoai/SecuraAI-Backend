import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { reportExportsRepository } from '../src/modules/audit-security-reporting/report-exports.repository.js';
import { renderSecurityReportPdf } from '../src/modules/audit-security-reporting/security-report-pdf.js';

vi.mock('../src/modules/audit-security-reporting/report-exports.repository.js', () => ({
  reportExportsRepository: {
    compileRiskData: vi.fn(),
    compileIncidentData: vi.fn(),
    compileSecurityPostureData: vi.fn(),
  },
}));

describe('Security Report PDF Formatter (System Logs Form)', () => {
  const mockItem = {
    id: 'exp-pdf-001',
    created_at: new Date('2026-10-15T08:30:00.000Z'),
    users: {
      id: 'usr-1',
      full_name: 'Security Officer John',
      email: 'officer.john@secura.ai',
      role: 'SECURITY_OFFICER',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a branded RISK PDF report with Unicode metadata and table', async () => {
    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([
      {
        id: 'r1',
        risk_code: 'RSK-001',
        title: 'SQL Injection Vulnerability in Auth Service',
        description: 'Critical flaw requiring urgent patch',
        status: 'OPEN',
        created_at: new Date('2026-10-10T12:00:00.000Z'),
        risk_assessments: [
          {
            inherent_rating: 'CRITICAL',
            residual_rating: 'HIGH',
            control_effectiveness: 45 as unknown as Prisma.Decimal,
          },
        ],
      },
    ]);

    const buffer = await renderSecurityReportPdf('RISK', mockItem, {
      reportType: 'RISK',
      format: 'PDF',
      status: 'OPEN',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1_000);
  });

  it('renders an INCIDENT PDF report with severity colors and handler details', async () => {
    vi.mocked(reportExportsRepository.compileIncidentData).mockResolvedValue([
      {
        id: 'inc-1',
        incident_code: 'INC-D3294A6B17DE4146',
        title: 'Ransomware Outbreak on Domain Controller',
        severity: 'CRITICAL',
        status: 'CONTAINMENT',
        detected_at: new Date('2026-10-14T14:30:00.000Z'),
        created_at: new Date('2026-10-14T14:35:00.000Z'),
        handler_user_id: 'usr-1',
        users_incidents_created_byTousers: { full_name: 'SOC Agent Alice' },
      },
    ]);

    const buffer = await renderSecurityReportPdf('INCIDENT', mockItem, {
      reportType: 'INCIDENT',
      format: 'PDF',
      severity: 'CRITICAL',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1_000);
  });

  it('renders an Executive SECURITY_POSTURE PDF report with KPI cards', async () => {
    vi.mocked(reportExportsRepository.compileSecurityPostureData).mockResolvedValue({
      postureScore: 92,
      postureLevel: 'STRONG',
      complianceRate: 98,
      totalAssets: 150,
      criticalAssets: 25,
      totalRisks: 12,
      openRisks: 2,
      totalIncidents: 6,
      openIncidents: 1,
      totalEvents24h: 120000,
      totalAlerts24h: 4,
      openFindings: 1,
    });

    const buffer = await renderSecurityReportPdf('SECURITY_POSTURE', mockItem, {
      reportType: 'SECURITY_POSTURE',
      format: 'PDF',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1_000);
  });

  it('handles empty records cleanly without throwing error', async () => {
    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([]);

    const buffer = await renderSecurityReportPdf('RISK', mockItem, {
      reportType: 'RISK',
      format: 'PDF',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1_000);
  });
});
