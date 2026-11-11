import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  users: { findUnique: vi.fn() },
  report_exports: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  audit_logs: { create: vi.fn(), findFirst: vi.fn() },
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ...tx,
    $transaction: (input: ((transaction: typeof tx) => Promise<unknown>) | Promise<unknown>[]) =>
      typeof input === 'function' ? input(tx) : Promise.all(input),
  },
}));

import { reportExportsRepository } from '../src/modules/audit-security-reporting/report-exports.repository.js';

describe('reportExportsRepository audit logging', () => {
  const actorUserId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('atomically creates report export and REPORT_EXPORT_GENERATED audit log with sha256 chained hash', async () => {
    tx.audit_logs.findFirst.mockResolvedValue({ record_hash: 'prev_hash_123' });
    tx.report_exports.create.mockImplementation(({ data }) => Promise.resolve({ ...data, users: { id: actorUserId } }));

    const created = await reportExportsRepository.createExportRecord({
      reportType: 'RISK',
      requestedBy: actorUserId,
      filters: { format: 'EXCEL' },
      status: 'COMPLETED',
      auditData: {
        report_type: 'RISK',
        format: 'EXCEL',
        record_count: 5,
        export_status: 'COMPLETED',
      },
      context: {
        sourceIp: '127.0.0.1',
        userAgent: 'Vitest/TestAgent',
      },
    });

    expect(created.report_type).toBe('RISK');
    expect(created.storage_uri).toContain('/api/v1/reports/exports/');
    expect(created.storage_uri).toContain('/download');

    expect(tx.report_exports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          report_type: 'RISK',
          requested_by: actorUserId,
          status: 'COMPLETED',
        }),
      }),
    );

    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REPORT_EXPORT_GENERATED',
          actor_user_id: actorUserId,
          actor_type: 'USER',
          resource_type: 'REPORT_EXPORT',
          previous_hash: 'prev_hash_123',
          source_ip: '127.0.0.1',
          user_agent: 'Vitest/TestAgent',
          record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('records download audit log for SUCCESS outcome', async () => {
    tx.audit_logs.findFirst.mockResolvedValue({ record_hash: 'prev_hash_456' });
    tx.audit_logs.create.mockResolvedValue({ id: 'audit-log-1' });

    await reportExportsRepository.recordDownloadAudit({
      actorUserId,
      exportId: 'export-uuid-1',
      outcome: 'SUCCESS',
      afterData: {
        id: 'export-uuid-1',
        report_type: 'RISK',
        format: 'CSV',
        filename: 'securaai-risk-report.csv',
      },
      context: {
        sourceIp: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      },
    });

    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REPORT_EXPORT_DOWNLOADED',
          actor_user_id: actorUserId,
          resource_id: 'export-uuid-1',
          resource_type: 'REPORT_EXPORT',
          outcome: 'SUCCESS',
          previous_hash: 'prev_hash_456',
          source_ip: '192.168.1.100',
          user_agent: 'Mozilla/5.0',
          record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('records download audit log for DENIED outcome when revoked', async () => {
    tx.audit_logs.findFirst.mockResolvedValue(null);
    tx.audit_logs.create.mockResolvedValue({ id: 'audit-log-2' });

    await reportExportsRepository.recordDownloadAudit({
      actorUserId,
      exportId: 'export-uuid-2',
      outcome: 'DENIED',
      errorCode: 'GONE',
      afterData: {
        id: 'export-uuid-2',
        report_type: 'RISK',
        format: 'EXCEL',
      },
    });

    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REPORT_EXPORT_DOWNLOADED',
          actor_user_id: actorUserId,
          resource_id: 'export-uuid-2',
          outcome: 'DENIED',
          error_code: 'GONE',
          record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });
});

