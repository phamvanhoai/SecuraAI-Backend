import { describe, expect, it } from 'vitest';
import {
  exportReportRequestSchema,
  listExportReportsQuerySchema,
  reportExportItemSchema,
} from '../src/modules/audit-security-reporting/dto/export-security-reports.dto.js';

describe('Report Exports DTO Validation', () => {
  it('validates a valid export report request for RISK report in EXCEL format', () => {
    const input = {
      reportType: 'RISK',
      format: 'EXCEL',
      startDate: '2026-10-01',
      endDate: '2026-10-14',
      status: 'OPEN',
    };
    const parsed = exportReportRequestSchema.parse(input);
    expect(parsed.reportType).toBe('RISK');
    expect(parsed.format).toBe('EXCEL');
  });

  it('validates a valid export report request for INCIDENT report in PDF format', () => {
    const input = {
      reportType: 'INCIDENT',
      format: 'PDF',
      severity: 'HIGH',
    };
    const parsed = exportReportRequestSchema.parse(input);
    expect(parsed.reportType).toBe('INCIDENT');
    expect(parsed.format).toBe('PDF');
  });

  it('validates SECURITY_POSTURE report request with defaults', () => {
    const input = {
      reportType: 'SECURITY_POSTURE',
    };
    const parsed = exportReportRequestSchema.parse(input);
    expect(parsed.reportType).toBe('SECURITY_POSTURE');
    expect(parsed.format).toBe('EXCEL');
  });

  it('rejects invalid reportType', () => {
    const invalid = {
      reportType: 'INVALID_TYPE',
    };
    expect(() => exportReportRequestSchema.parse(invalid)).toThrow();
  });

  it('validates list query defaults and coercion', () => {
    const query = {
      page: '2',
      limit: '25',
      reportType: 'RISK',
    };
    const parsed = listExportReportsQuerySchema.parse(query);
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(25);
    expect(parsed.reportType).toBe('RISK');
    expect(parsed.sortBy).toBe('createdAt');
    expect(parsed.sortOrder).toBe('desc');
  });

  it('validates a complete report export item', () => {
    const item = {
      id: '11111111-1111-4111-8111-111111111111',
      reportType: 'RISK',
      format: 'EXCEL',
      status: 'COMPLETED',
      storageUri: '/api/v1/reports/exports/11111111-1111-4111-8111-111111111111/download',
      requestedBy: {
        id: '22222222-2222-4222-8222-222222222222',
        fullName: 'Jane Security Officer',
        role: 'SECURITY_OFFICER',
      },
      filters: { format: 'EXCEL', recordCount: 15 },
      downloadUrl: '/api/v1/reports/exports/11111111-1111-4111-8111-111111111111/download',
      generatedAt: '2026-10-14T00:00:00.000Z',
      createdAt: '2026-10-14T00:00:00.000Z',
    };
    const parsed = reportExportItemSchema.parse(item);
    expect(parsed.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(parsed.status).toBe('COMPLETED');
  });
});
