import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/common/errors/app-error.js';
import { reportExportsRepository } from '../src/modules/audit-security-reporting/report-exports.repository.js';
import { reportExportsService } from '../src/modules/audit-security-reporting/report-exports.service.js';

vi.mock('../src/modules/audit-security-reporting/report-exports.repository.js', () => ({
  reportExportsRepository: {
    findActor: vi.fn(),
    createExportRecord: vi.fn(),
    listExports: vi.fn(),
    findExportById: vi.fn(),
    updateExportFilters: vi.fn(),
    compileRiskData: vi.fn(),
    compileIncidentData: vi.fn(),
    compileSecurityPostureData: vi.fn(),
  },
}));

describe('Report Exports Service', () => {
  const officerId = '11111111-1111-1111-1111-111111111111';
  const executiveId = '22222222-2222-2222-2222-222222222222';
  const adminId = '33333333-3333-3333-3333-333333333333';
  const employeeId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated or inactive users with 401', async () => {
    vi.mocked(reportExportsRepository.findActor).mockResolvedValue(null);
    await expect(
      reportExportsService.exportReport('unknown', { reportType: 'RISK', format: 'EXCEL' }),
    ).rejects.toThrowError(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));

    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: 'inactive',
      role: 'SECURITY_OFFICER' as any,
      status: 'INACTIVE' as any,
      full_name: 'Inactive Officer',
    });
    await expect(
      reportExportsService.exportReport('inactive', { reportType: 'RISK', format: 'EXCEL' }),
    ).rejects.toThrowError(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
  });

  it('rejects unauthorized roles (ADMIN and EMPLOYEE) with 403 in compliance with SoD', async () => {
    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: employeeId,
      role: 'EMPLOYEE' as any,
      status: 'ACTIVE' as any,
      full_name: 'Regular Employee',
    });
    await expect(
      reportExportsService.exportReport(employeeId, { reportType: 'RISK', format: 'EXCEL' }),
    ).rejects.toThrowError(
      new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required'),
    );

    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: adminId,
      role: 'ADMIN' as any,
      status: 'ACTIVE' as any,
      full_name: 'System Admin',
    });
    await expect(
      reportExportsService.exportReport(adminId, { reportType: 'RISK', format: 'EXCEL' }),
    ).rejects.toThrowError(
      new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required'),
    );
  });

  it('successfully generates a RISK report for Security Officer', async () => {
    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: officerId,
      role: 'SECURITY_OFFICER' as any,
      status: 'ACTIVE' as any,
      full_name: 'Security Officer 1',
    });

    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([
      {
        id: 'r1',
        risk_code: 'RSK-001',
        title: 'Unpatched database server',
        description: 'Vulnerability in DB',
        status: 'OPEN' as any,
        created_at: new Date('2026-10-10'),
        risk_assessments: [
          {
            inherent_rating: 'HIGH' as any,
            residual_rating: 'MEDIUM' as any,
            control_effectiveness: 60 as any,
          },
        ],
      },
    ]);

    vi.mocked(reportExportsRepository.createExportRecord).mockResolvedValue({
      id: 'exp-123',
      report_type: 'RISK',
      requested_by: officerId,
      filters: { format: 'EXCEL' },
      status: 'COMPLETED' as any,
      storage_uri: '/api/v1/reports/exports/exp-123/download',
      generated_at: new Date(),
      created_at: new Date(),
      users: { id: officerId, full_name: 'Security Officer 1', role: 'SECURITY_OFFICER' as any },
    } as any);

    const result = await reportExportsService.exportReport(officerId, {
      reportType: 'RISK',
      format: 'EXCEL',
    });

    expect(result.reportType).toBe('RISK');
    expect(result.status).toBe('COMPLETED');
    expect(result.downloadUrl).toContain('/download');
    expect(result.summary?.recordCount).toBe(1);
  });

  it('successfully downloads a CSV report with UTF-8 BOM and formula sanitization', async () => {
    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: officerId,
      role: 'SECURITY_OFFICER' as any,
      status: 'ACTIVE' as any,
      full_name: 'Security Officer 1',
    });

    vi.mocked(reportExportsRepository.findExportById).mockResolvedValue({
      id: 'exp-csv-123',
      report_type: 'RISK',
      requested_by: officerId,
      filters: { format: 'CSV' },
      status: 'COMPLETED' as any,
      storage_uri: '/api/v1/reports/exports/exp-csv-123/download',
      generated_at: new Date('2026-10-14'),
      created_at: new Date('2026-10-14'),
      users: { id: officerId, full_name: 'Security Officer 1', role: 'SECURITY_OFFICER' as any },
    } as any);

    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([
      {
        id: 'r1',
        risk_code: '=cmd|calc!A1', // Formula injection test payload
        title: 'Safe title',
        description: 'Test',
        status: 'OPEN' as any,
        created_at: new Date('2026-10-10'),
        risk_assessments: [],
      },
    ]);

    const file = await reportExportsService.downloadReport(officerId, 'exp-csv-123');

    expect(file.contentType).toBe('text/csv; charset=utf-8');
    expect(file.filename).toContain('securaai-risk-report');
    expect(file.filename).toContain('.csv');
    expect(typeof file.content).toBe('string');
    const contentStr = file.content as string;
    expect(contentStr.startsWith('\uFEFF')).toBe(true);
    // Formula prefix must be escaped with single quote
    expect(contentStr).toContain("'=cmd|calc!A1");
  });

  it('successfully downloads a real Excel (XLSX) binary report', async () => {
    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: officerId,
      role: 'SECURITY_OFFICER' as any,
      status: 'ACTIVE' as any,
      full_name: 'Security Officer 1',
    });

    vi.mocked(reportExportsRepository.findExportById).mockResolvedValue({
      id: 'exp-xlsx-123',
      report_type: 'RISK',
      requested_by: officerId,
      filters: { format: 'EXCEL' },
      status: 'COMPLETED' as any,
      storage_uri: '/api/v1/reports/exports/exp-xlsx-123/download',
      generated_at: new Date('2026-10-14'),
      created_at: new Date('2026-10-14'),
      users: { id: officerId, full_name: 'Security Officer 1', role: 'SECURITY_OFFICER' as any },
    } as any);

    vi.mocked(reportExportsRepository.compileRiskData).mockResolvedValue([
      {
        id: 'r1',
        risk_code: 'RSK-100',
        title: 'Unauthenticated API access',
        description: 'Critical issue',
        status: 'OPEN' as any,
        created_at: new Date('2026-10-10'),
        risk_assessments: [
          {
            inherent_rating: 'HIGH' as any,
            residual_rating: 'MEDIUM' as any,
            control_effectiveness: 70 as any,
          },
        ],
      },
    ]);

    const file = await reportExportsService.downloadReport(officerId, 'exp-xlsx-123');

    expect(file.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(file.filename).toContain('securaai-risk-report');
    expect(file.filename).toContain('.xlsx');
    expect(Buffer.isBuffer(file.content)).toBe(true);
    expect((file.content as Buffer).length).toBeGreaterThan(1000);
  });

  it('successfully downloads a real PDF binary report', async () => {
    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: executiveId,
      role: 'EXECUTIVE' as any,
      status: 'ACTIVE' as any,
      full_name: 'Executive Leader',
    });

    vi.mocked(reportExportsRepository.findExportById).mockResolvedValue({
      id: 'exp-pdf-456',
      report_type: 'SECURITY_POSTURE',
      requested_by: executiveId,
      filters: { format: 'PDF' },
      status: 'COMPLETED' as any,
      storage_uri: '/api/v1/reports/exports/exp-pdf-456/download',
      generated_at: new Date('2026-10-14'),
      created_at: new Date('2026-10-14'),
      users: { id: executiveId, full_name: 'Executive Leader', role: 'EXECUTIVE' as any },
    } as any);

    vi.mocked(reportExportsRepository.compileSecurityPostureData).mockResolvedValue({
      postureScore: 88,
      postureLevel: 'STRONG',
      complianceRate: 94,
      totalAssets: 150,
      criticalAssets: 25,
      totalRisks: 30,
      openRisks: 8,
      totalIncidents: 10,
      openIncidents: 2,
      totalEvents24h: 50000,
      totalAlerts24h: 12,
      openFindings: 2,
    });

    const file = await reportExportsService.downloadReport(executiveId, 'exp-pdf-456');

    expect(file.contentType).toBe('application/pdf');
    expect(file.filename).toContain('securaai-security_posture-report');
    expect(file.filename).toContain('.pdf');
    expect(Buffer.isBuffer(file.content)).toBe(true);
    expect((file.content as Buffer).length).toBeGreaterThan(500);
  });

  it('successfully revokes an export report with reason', async () => {
    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: officerId,
      role: 'SECURITY_OFFICER' as any,
      status: 'ACTIVE' as any,
      full_name: 'Security Officer 1',
    });

    vi.mocked(reportExportsRepository.findExportById).mockResolvedValue({
      id: 'exp-to-revoke',
      report_type: 'RISK',
      requested_by: officerId,
      filters: { format: 'EXCEL' },
      status: 'COMPLETED' as any,
      storage_uri: '/api/v1/reports/exports/exp-to-revoke/download',
      generated_at: new Date('2026-10-14'),
      created_at: new Date('2026-10-14'),
      users: { id: officerId, full_name: 'Security Officer 1', role: 'SECURITY_OFFICER' as any },
    } as any);

    vi.mocked(reportExportsRepository.updateExportFilters).mockResolvedValue({
      id: 'exp-to-revoke',
      report_type: 'RISK',
      requested_by: officerId,
      filters: {
        format: 'EXCEL',
        isRevoked: true,
        revocationReason: 'Filtered wrong date range',
      },
      status: 'COMPLETED' as any,
      storage_uri: '/api/v1/reports/exports/exp-to-revoke/download',
      generated_at: new Date('2026-10-14'),
      created_at: new Date('2026-10-14'),
      users: { id: officerId, full_name: 'Security Officer 1', role: 'SECURITY_OFFICER' as any },
    } as any);

    const revoked = await reportExportsService.revokeExport(
      officerId,
      'exp-to-revoke',
      'Filtered wrong date range',
    );

    expect(revoked.isRevoked).toBe(true);
    expect(revoked.revocationReason).toBe('Filtered wrong date range');
    expect(reportExportsRepository.updateExportFilters).toHaveBeenCalledWith(
      'exp-to-revoke',
      expect.objectContaining({
        isRevoked: true,
        revocationReason: 'Filtered wrong date range',
      }),
      expect.objectContaining({
        actorUserId: officerId,
      }),
    );
  });

  it('rejects downloading a revoked report with 410 GONE', async () => {
    vi.mocked(reportExportsRepository.findActor).mockResolvedValue({
      id: officerId,
      role: 'SECURITY_OFFICER' as any,
      status: 'ACTIVE' as any,
      full_name: 'Security Officer 1',
    });

    vi.mocked(reportExportsRepository.findExportById).mockResolvedValue({
      id: 'exp-revoked',
      report_type: 'RISK',
      requested_by: officerId,
      filters: {
        format: 'EXCEL',
        isRevoked: true,
        revocationReason: 'Filtered wrong date range',
      },
      status: 'COMPLETED' as any,
      storage_uri: '/api/v1/reports/exports/exp-revoked/download',
      generated_at: new Date('2026-10-14'),
      created_at: new Date('2026-10-14'),
      users: { id: officerId, full_name: 'Security Officer 1', role: 'SECURITY_OFFICER' as any },
    } as any);

    await expect(
      reportExportsService.downloadReport(officerId, 'exp-revoked'),
    ).rejects.toThrowError(
      new AppError(410, 'GONE', 'Report export has been revoked: Filtered wrong date range'),
    );
  });
});
