import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { reportExportsRepository } from '../src/modules/audit-security-reporting/report-exports.repository.js';
import { renderSecurityReportCsv } from '../src/modules/audit-security-reporting/security-report-csv.js';

vi.mock('../src/modules/audit-security-reporting/report-exports.repository.js', () => ({
  reportExportsRepository: {
    compileRiskData: vi.fn(),
    compileIncidentData: vi.fn(),
    compileSecurityPostureData: vi.fn(),
  },
}));

describe('Security Report CSV Formatter (System Logs Form)', () => {
  const mockItem = {
    id: 'exp-csv-001',
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

  it('renders a flat CSV table matching System Logs form with UTF-8 BOM, audit metadata columns, and risk rows', async () => {
    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([
      {
        id: 'r1',
        risk_code: 'RSK-001',
        title: 'SQL Injection Vulnerability',
        description: 'Critical flaw',
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

    const csv = await renderSecurityReportCsv('RISK', mockItem, {
      reportType: 'RISK',
      format: 'CSV',
      status: 'OPEN',
      startDate: '2026-10-01',
      endDate: '2026-10-15',
    });

    expect(typeof csv).toBe('string');
    // Must start with UTF-8 BOM
    expect(csv.startsWith('\uFEFF')).toBe(true);

    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Header row matches System Logs form: Metadata headers followed by domain headers
    const headerLine = lines[0];
    expect(headerLine).toContain('"Schema Version","Export ID","Generated At UTC","Display Time Zone","Exported By","Exporter Email","Exporter Role","Purpose","Scope","Applied Filters","Record Count","Record-set SHA-256"');
    expect(headerLine).toContain('"Risk Code","Title","Status","Inherent Rating","Residual Rating","Control Effectiveness","Created Date"');

    // Data row contains prepended metadata and risk attributes
    const dataLine = lines[1];
    expect(dataLine).toContain('"2.0.0"');
    expect(dataLine).toContain('"exp-csv-001"');
    expect(dataLine).toContain('"2026-10-15T08:30:00.000Z"');
    expect(dataLine).toContain('"Asia/Ho_Chi_Minh"');
    expect(dataLine).toContain('"Security Officer John"');
    expect(dataLine).toContain('"officer.john@secura.ai"');
    expect(dataLine).toContain('"SECURITY_OFFICER"');
    expect(dataLine).toContain('"Security Audit & Risk Management"');
    expect(dataLine).toContain('"RISK"');
    expect(dataLine).toContain('"RSK-001"');
    expect(dataLine).toContain('"SQL Injection Vulnerability"');
    expect(dataLine).toContain('"OPEN"');
    expect(dataLine).toContain('"CRITICAL"');
    expect(dataLine).toContain('"HIGH"');
    expect(dataLine).toContain('"45%"');
    expect(dataLine).toContain('"2026-10-10"');
  });

  it('renders an INCIDENT CSV export matching System Logs form', async () => {
    vi.mocked(reportExportsRepository.compileIncidentData).mockResolvedValue([
      {
        id: 'inc-1',
        incident_code: 'INC-2026-001',
        title: 'Ransomware on DC',
        severity: 'CRITICAL',
        status: 'CLOSED',
        detected_at: new Date('2026-10-14T14:30:00.000Z'),
        created_at: new Date('2026-10-14T14:35:00.000Z'),
        handler_user_id: 'usr-1',
        users_incidents_created_byTousers: { full_name: 'SOC Agent Alice' },
      },
    ]);

    const csv = await renderSecurityReportCsv('INCIDENT', mockItem, {
      reportType: 'INCIDENT',
      format: 'CSV',
      severity: 'CRITICAL',
    });

    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toContain('"Incident Code","Title","Severity","Status","Assigned Handler","Detected At","Created Date"');
    expect(lines[1]).toContain('"INC-2026-001"');
    expect(lines[1]).toContain('"Ransomware on DC"');
    expect(lines[1]).toContain('"CRITICAL"');
    expect(lines[1]).toContain('"CLOSED"');
    expect(lines[1]).toContain('"SOC Agent Alice"');
    expect(lines[1]).toContain('"2026-10-14 14:30"');
    expect(lines[1]).toContain('"2026-10-14"');
  });

  it('renders a SECURITY_POSTURE executive CSV report matching System Logs form', async () => {
    vi.mocked(reportExportsRepository.compileSecurityPostureData).mockResolvedValue({
      postureScore: 90,
      postureLevel: 'STRONG',
      complianceRate: 95,
      totalAssets: 100,
      criticalAssets: 20,
      totalRisks: 10,
      openRisks: 2,
      totalIncidents: 5,
      openIncidents: 1,
      totalEvents24h: 50000,
      totalAlerts24h: 3,
      openFindings: 1,
    });

    const csv = await renderSecurityReportCsv('SECURITY_POSTURE', mockItem, {
      reportType: 'SECURITY_POSTURE',
      format: 'CSV',
    });

    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toContain('"Metric / Indicator","Current Value","Evaluation Assessment","Standard Benchmark"');
    expect(lines[1]).toContain('"Security Posture Health Score"');
    expect(lines[1]).toContain('"90 / 100"');
    expect(lines[1]).toContain('"STRONG"');
    expect(lines[1]).toContain('">= 80 (Good)"');
  });

  it('sanitizes formula injection prefixes and quotes cells in CSV', async () => {
    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([
      {
        id: 'r2',
        risk_code: '=cmd|calc!A1',
        title: 'Title with, comma and "quotes"',
        description: 'Injection test',
        status: 'OPEN',
        created_at: new Date('2026-10-10'),
        risk_assessments: [],
      },
    ]);

    const csv = await renderSecurityReportCsv('RISK', mockItem, {
      reportType: 'RISK',
      format: 'CSV',
    });

    // Formula injection prefix escaped with single quote inside quotes
    expect(csv).toContain('"\'=cmd|calc!A1"');
    // Value with comma and double quotes properly wrapped in quotes and escaped
    expect(csv).toContain('"Title with, comma and ""quotes"""');
  });
});
