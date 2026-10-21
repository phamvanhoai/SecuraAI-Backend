import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { reportExportsRepository } from '../src/modules/audit-security-reporting/report-exports.repository.js';
import { renderSecurityReportXlsx } from '../src/modules/audit-security-reporting/security-report-xlsx.js';

vi.mock('../src/modules/audit-security-reporting/report-exports.repository.js', () => ({
  reportExportsRepository: {
    compileRiskData: vi.fn(),
    compileIncidentData: vi.fn(),
    compileSecurityPostureData: vi.fn(),
  },
}));

describe('Security Report XLSX Formatter', () => {
  const mockItem = {
    id: 'exp-excel-001',
    created_at: new Date('2026-10-15T08:30:00.000Z'),
    users: {
      id: 'usr-1',
      full_name: 'Security Officer John',
      role: 'SECURITY_OFFICER',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a professional RISK report matching System Logs form layout', async () => {
    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([
      {
        id: 'r1',
        risk_code: 'RSK-001',
        title: 'SQL Injection Vulnerability',
        description: 'Critical DB injection flaw',
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
      {
        id: 'r2',
        risk_code: 'RSK-002',
        title: 'Weak Password Policy',
        description: 'Low severity issue',
        status: 'CLOSED',
        created_at: new Date('2026-10-12T10:00:00.000Z'),
        risk_assessments: [
          {
            inherent_rating: 'MEDIUM',
            residual_rating: 'LOW',
            control_effectiveness: 90 as unknown as Prisma.Decimal,
          },
        ],
      },
    ]);

    const buffer = await renderSecurityReportXlsx('RISK', mockItem, {
      reportType: 'RISK',
      format: 'EXCEL',
      status: 'OPEN',
      startDate: '2026-10-01',
      endDate: '2026-10-15',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheet = workbook.getWorksheet('Risk Register');
    expect(sheet).toBeDefined();

    // Check Header Banner
    expect(sheet!.getCell('B1').value).toBe('SECURAAI · RISK REGISTER & ASSESSMENT EXPORT');
    expect(sheet!.getCell('B1').font?.bold).toBe(true);
    expect(sheet!.getCell('B2').value).toContain('ISO/IEC 27001:2022 ISMS');

    // Check Export Metadata section
    expect(sheet!.getCell('A4').value).toBe('EXPORT METADATA');
    expect(sheet!.getCell('A5').value).toBe('Schema version');
    expect(sheet!.getCell('B5').value).toBe('2.0.0');
    expect(sheet!.getCell('A6').value).toBe('Export ID');
    expect(sheet!.getCell('B6').value).toBe('exp-excel-001');

    // Check Applied Filters section (Row 16)
    expect(sheet!.getCell('A16').value).toBe('APPLIED FILTERS');
    expect(sheet!.getCell('B16').text).toContain('Status: OPEN');
    expect(sheet!.getCell('B16').text).toContain('2026-10-01');

    // Check Table Header row (Row 18)
    const headerRow = sheet!.getRow(18);
    expect(headerRow.getCell(1).value).toBe('Risk Code');
    expect(headerRow.getCell(2).value).toBe('Title');
    expect(headerRow.getCell(3).value).toBe('Status');
    expect(headerRow.getCell(4).value).toBe('Inherent Rating');
    expect(headerRow.getCell(5).value).toBe('Residual Rating');
    expect(headerRow.getCell(6).value).toBe('Control Effectiveness');
    expect(headerRow.getCell(7).value).toBe('Created Date');

    // Check Row 19 data
    const dataRow1 = sheet!.getRow(19);
    expect(dataRow1.getCell(1).value).toBe('RSK-001');
    expect(dataRow1.getCell(2).value).toBe('SQL Injection Vulnerability');
    expect(dataRow1.getCell(3).value).toBe('OPEN');
    expect(dataRow1.getCell(4).value).toBe('CRITICAL');
    expect(dataRow1.getCell(5).value).toBe('HIGH');
    expect(dataRow1.getCell(6).value).toBe('45%');

    // Check ratings font color formatting
    expect(dataRow1.getCell(4).font?.color?.argb).toBe('DC2626'); // CRITICAL red
    expect(dataRow1.getCell(5).font?.color?.argb).toBe('C27208'); // HIGH amber

    // Check frozen panes & auto-filter
    expect(sheet!.views?.[0]?.state).toBe('frozen');
    expect(sheet!.autoFilter).toBeDefined();
  });

  it('renders an INCIDENT report with severity badge colors and correct column widths', async () => {
    vi.mocked(reportExportsRepository.compileIncidentData).mockResolvedValue([
      {
        id: 'inc-1',
        incident_code: 'INC-2026-001',
        title: 'Ransomware detection on DC',
        severity: 'CRITICAL',
        status: 'CONTAINED' as any,
        detected_at: new Date('2026-10-14T14:30:00.000Z'),
        created_at: new Date('2026-10-14T14:35:00.000Z'),
        handler_user_id: 'usr-1',
        users_incidents_created_byTousers: { full_name: 'SOC Agent Alice' },
      },
    ]);

    const buffer = await renderSecurityReportXlsx('INCIDENT', mockItem, {
      reportType: 'INCIDENT',
      format: 'EXCEL',
      severity: 'CRITICAL',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheet = workbook.getWorksheet('Incident Register');
    expect(sheet).toBeDefined();

    expect(sheet!.getCell('B1').value).toBe('SECURAAI · INCIDENT MANAGEMENT & RESPONSE EXPORT');
    const headerRow = sheet!.getRow(18);
    expect(headerRow.getCell(1).value).toBe('Incident Code');
    expect(headerRow.getCell(3).value).toBe('Severity');
    expect(headerRow.getCell(4).value).toBe('Status');

    const dataRow = sheet!.getRow(19);
    expect(dataRow.getCell(1).value).toBe('INC-2026-001');
    expect(dataRow.getCell(3).value).toBe('CRITICAL');
    expect(dataRow.getCell(3).font?.color?.argb).toBe('DC2626');
    expect(dataRow.getCell(4).value).toBe('CONTAINED');
    expect(dataRow.getCell(4).font?.color?.argb).toBe('1769F6');
  });

  it('renders a SECURITY_POSTURE executive report', async () => {
    vi.mocked(reportExportsRepository.compileSecurityPostureData).mockResolvedValue({
      postureScore: 92,
      postureLevel: 'STRONG',
      complianceRate: 98,
      totalAssets: 240,
      criticalAssets: 35,
      totalRisks: 15,
      openRisks: 2,
      totalIncidents: 8,
      openIncidents: 0,
      totalEvents24h: 120000,
      totalAlerts24h: 4,
      openFindings: 1,
    });

    const buffer = await renderSecurityReportXlsx('SECURITY_POSTURE', mockItem, {
      reportType: 'SECURITY_POSTURE',
      format: 'EXCEL',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheet = workbook.getWorksheet('Security Posture');
    expect(sheet).toBeDefined();
    expect(sheet!.getCell('B1').value).toBe('SECURAAI · EXECUTIVE SECURITY POSTURE EXPORT');

    const dataRow = sheet!.getRow(19);
    expect(dataRow.getCell(1).value).toBe('Security Posture Health Score');
    expect(dataRow.getCell(2).value).toBe('92 / 100');
    expect(dataRow.getCell(3).value).toBe('STRONG');
  });

  it('sanitizes formula injection prefixes in data cells', async () => {
    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([
      {
        id: 'r3',
        risk_code: '=cmd|calc!A1',
        title: '+SUM(1,2)',
        description: 'Formula injection test',
        status: 'OPEN',
        created_at: new Date('2026-10-10'),
        risk_assessments: [],
      },
    ]);

    const buffer = await renderSecurityReportXlsx('RISK', mockItem, {
      reportType: 'RISK',
      format: 'EXCEL',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheet = workbook.getWorksheet('Risk Register');
    const dataRow = sheet!.getRow(19);
    // Values with formula prefixes must be prepended with a single quote
    expect(dataRow.getCell(1).value).toBe("'=cmd|calc!A1");
    expect(dataRow.getCell(2).value).toBe("'+SUM(1,2)");
  });
});
