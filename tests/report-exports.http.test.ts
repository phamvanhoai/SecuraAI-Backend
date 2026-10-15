import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { reportExportsService } from '../src/modules/audit-security-reporting/report-exports.service.js';
import { AppError } from '../src/common/errors/app-error.js';

let mockAuthenticatedUserId: string | null = '11111111-1111-1111-1111-111111111111';

vi.mock('../src/common/middleware/authenticate.js', () => ({
  authenticate: (_req: any, res: any, next: any) => {
    if (!mockAuthenticatedUserId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    res.locals.authenticatedUserId = mockAuthenticatedUserId;
    next();
  },
}));

vi.mock('../src/modules/audit-security-reporting/report-exports.service.js', () => ({
  reportExportsService: {
    exportReport: vi.fn(),
    listExports: vi.fn(),
    getExportDetail: vi.fn(),
    downloadReport: vi.fn(),
    revokeExport: vi.fn(),
  },
}));

describe('Report Exports HTTP API tests', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUserId = '11111111-1111-1111-1111-111111111111';
  });

  it('requires authentication and returns 401 when unauthenticated', async () => {
    mockAuthenticatedUserId = null;
    const res = await request(app).post('/api/v1/reports/exports').send({
      reportType: 'RISK',
      format: 'EXCEL',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when user is not Security Officer or Executive', async () => {
    vi.mocked(reportExportsService.exportReport).mockRejectedValue(
      new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required'),
    );

    const res = await request(app).post('/api/v1/reports/exports').send({
      reportType: 'RISK',
      format: 'EXCEL',
    });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Security Officer or Executive');
  });

  it('returns 201 on successful report export request', async () => {
    const mockCreated = {
      id: 'aaaa1111-2222-4333-8444-555566667777',
      reportType: 'RISK' as const,
      format: 'EXCEL' as const,
      status: 'COMPLETED' as const,
      storageUri: '/api/v1/reports/exports/aaaa1111-2222-4333-8444-555566667777/download',
      requestedBy: {
        id: '11111111-1111-1111-1111-111111111111',
        fullName: 'Jane Officer',
        role: 'SECURITY_OFFICER',
      },
      filters: { format: 'EXCEL' },
      downloadUrl: '/api/v1/reports/exports/aaaa1111-2222-4333-8444-555566667777/download',
      isRevoked: false,
      generatedAt: '2026-10-14T00:00:00.000Z',
      createdAt: '2026-10-14T00:00:00.000Z',
    };

    vi.mocked(reportExportsService.exportReport).mockResolvedValue(mockCreated);

    const res = await request(app).post('/api/v1/reports/exports').send({
      reportType: 'RISK',
      format: 'EXCEL',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('aaaa1111-2222-4333-8444-555566667777');
    expect(res.body.data.downloadUrl).toContain('/download');
  });

  it('returns 200 on GET /api/v1/reports/exports', async () => {
    const mockList = {
      items: [],
      pagination: {
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 1,
      },
    };

    vi.mocked(reportExportsService.listExports).mockResolvedValue(mockList as any);

    const res = await request(app).get('/api/v1/reports/exports?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
  });

  it('downloads file stream on GET /api/v1/reports/exports/:id/download', async () => {
    vi.mocked(reportExportsService.downloadReport).mockResolvedValue({
      filename: 'securaai-risk-report-2026-10-14.csv',
      contentType: 'text/csv; charset=utf-8',
      content: '\uFEFFheader1,header2\r\nval1,val2',
    });

    const res = await request(app).get(
      '/api/v1/reports/exports/aaaa1111-2222-4333-8444-555566667777/download',
    );

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('text/csv');
    expect(res.header['content-disposition']).toContain('attachment; filename="securaai-risk-report-2026-10-14.csv"');
    expect(res.text).toContain('val1,val2');
  });

  it('revokes an export report on POST /api/v1/reports/exports/:id/revoke', async () => {
    vi.mocked(reportExportsService.revokeExport).mockResolvedValue({
      id: 'aaaa1111-2222-4333-8444-555566667777',
      reportType: 'RISK',
      format: 'EXCEL',
      status: 'COMPLETED',
      storageUri: '/api/v1/reports/exports/aaaa1111-2222-4333-8444-555566667777/download',
      requestedBy: {
        id: '11111111-1111-1111-1111-111111111111',
        fullName: 'Security Officer',
        role: 'SECURITY_OFFICER',
      },
      filters: { format: 'EXCEL', isRevoked: true },
      downloadUrl: '/api/v1/reports/exports/aaaa1111-2222-4333-8444-555566667777/download',
      isRevoked: true,
      revocationReason: 'Filtered wrong date range',
      generatedAt: '2026-10-14T00:00:00.000Z',
      createdAt: '2026-10-14T00:00:00.000Z',
    });

    const res = await request(app)
      .post('/api/v1/reports/exports/aaaa1111-2222-4333-8444-555566667777/revoke')
      .send({ reason: 'Filtered wrong date range' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isRevoked).toBe(true);
    expect(res.body.data.revocationReason).toBe('Filtered wrong date range');
  });
});
