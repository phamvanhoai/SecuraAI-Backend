import { describe, expect, it } from 'vitest';
import { renderInvestigationLogPdf } from '../src/modules/notification-system-logs/investigation-log-pdf.js';

describe('renderInvestigationLogPdf', () => {
  it('renders a branded evidence report with Unicode metadata', async () => {
    const content = await renderInvestigationLogPdf(
      {
        schemaVersion: '1.0',
        exportId: '00000000-0000-4000-8000-000000000001',
        title: 'SecuraAI Investigation Log Export',
        generatedAt: '2026-10-09T08:00:00.000Z',
        displayTimeZone: 'Asia/Ho_Chi_Minh',
        exportedBy: {
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Nguyễn Văn An',
          email: 'admin@example.test',
          role: 'ADMIN',
        },
        purpose: 'Điều tra hoạt động đăng nhập bất thường',
        scope: 'FILTERED',
        format: 'PDF',
        recordCount: 1,
        sourceSystem: 'SecuraAI',
        sourceDataset: 'audit_logs',
        recordSetSha256: 'a'.repeat(64),
      },
      { status: 'FAILURE' },
      [
        {
          id: '00000000-0000-4000-8000-000000000003',
          occurredAt: '2026-10-09T07:00:00.000Z',
          eventType: 'AUTH_LOGIN_FAILED',
          source: 'Authentication',
          actor: 'Nguyễn Văn An',
          actorEmail: 'admin@example.test',
          actorType: 'USER',
          status: 'FAILURE',
          resourceType: 'AUTH_SESSION',
          resourceId: null,
          sourceIp: '192.0.2.1',
          correlationId: null,
          errorCode: 'INVALID',
          durationMs: 125,
        },
      ],
    );
    expect(content.subarray(0, 4).toString()).toBe('%PDF');
    expect(content.length).toBeGreaterThan(1_000);
  });
});
