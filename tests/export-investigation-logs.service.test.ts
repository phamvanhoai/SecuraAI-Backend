import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/modules/notification-system-logs/system-logs.repository.js', () => ({
  systemLogsRepository: { findActor: vi.fn(), findForExport: vi.fn(), recordExport: vi.fn() },
}));
import { systemLogsRepository } from '../src/modules/notification-system-logs/system-logs.repository.js';
import { systemLogsService } from '../src/modules/notification-system-logs/system-logs.service.js';
import type { ExportInvestigationLogsInput } from '../src/modules/notification-system-logs/dto/export-investigation-logs.dto.js';

const input: ExportInvestigationLogsInput = {
  format: 'CSV',
  scope: 'FILTERED',
  selectedIds: [],
  filters: {},
  reason: 'Investigating suspicious authentication activity',
};

describe('systemLogsService.export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates a CSV and records the export', async () => {
    vi.mocked(systemLogsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
      full_name: 'Security Officer',
      email: 'officer@example.test',
    });
    vi.mocked(systemLogsRepository.findForExport).mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        action: '=FORMULA',
        resource_type: 'AUTH_SESSION',
        resource_id: null,
        occurred_at: new Date('2026-10-09T01:00:00.000Z'),
        outcome: 'FAILURE',
        source: 'Auth',
        source_ip: null,
        correlation_id: null,
        error_code: 'INVALID',
        duration_ms: null,
        actor_type: 'SYSTEM',
        users: null,
        integration_api_keys: null,
      },
    ]);
    vi.mocked(systemLogsRepository.recordExport).mockResolvedValue(undefined);
    const result = await systemLogsService.export('actor-id', input);
    expect(result.contentType).toContain('text/csv');
    expect(result.content).toContain("'=FORMULA");
    expect(systemLogsRepository.recordExport).toHaveBeenCalledWith(
      expect.any(String),
      'actor-id',
      input,
      1,
      expect.any(Date),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('rejects exports above the record limit', async () => {
    vi.mocked(systemLogsRepository.findActor).mockResolvedValue({
      role: 'ADMIN',
      status: 'ACTIVE',
      full_name: 'Administrator',
      email: 'admin@example.test',
    });
    vi.mocked(systemLogsRepository.findForExport).mockResolvedValue(
      Array.from({ length: 10_001 }, () => ({}) as never),
    );
    await expect(systemLogsService.export('actor-id', input)).rejects.toMatchObject({
      statusCode: 422,
      code: 'EXPORT_TOO_LARGE',
    });
  });
});
