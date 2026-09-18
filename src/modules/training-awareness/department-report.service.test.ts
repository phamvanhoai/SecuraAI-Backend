import { beforeEach, describe, expect, it, vi } from 'vitest';
import { departmentReportQuerySchema } from './dto/department-report.dto.js';
import { departmentReportService } from './department-report.service.js';
import { departmentReportRepository } from './department-report.repository.js';
vi.mock('./department-report.repository.js', () => ({
  departmentReportRepository: { get: vi.fn() },
}));
describe('department training report', () => {
  beforeEach(() => vi.clearAllMocks());
  it('bounds query input', () => {
    expect(departmentReportQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      q: '',
      progress: 'all',
    });
    for (const query of [
      { page: 0 },
      { limit: 101 },
      { q: 'x'.repeat(101) },
      { page: 'NaN' },
      { progress: 'unknown' },
    ])
      expect(departmentReportQuerySchema.safeParse(query).success).toBe(false);
  });
  it('rejects missing permission before querying', async () => {
    await expect(
      departmentReportService.get(
        { page: 1, limit: 10, q: '', progress: 'all' },
        { permissions: [] },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(departmentReportRepository.get).not.toHaveBeenCalled();
  });
  it('preserves global summary when searching and paginating', async () => {
    const summary = { employees: 12, assigned: 30, completed: 15, overdue: 3, completionRate: 50 };
    vi.mocked(departmentReportRepository.get).mockResolvedValue({ items: [], total: 21, summary });
    const result = await departmentReportService.get(
      { page: 2, limit: 10, q: 'IT', progress: 'overdue' },
      { permissions: ['training-department-reports.read'] },
    );
    expect(result.summary).toEqual(summary);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 21, totalPages: 3 });
    expect(departmentReportRepository.get).toHaveBeenCalledWith(
      expect.objectContaining({ progress: 'overdue' }),
      expect.any(String),
    );
  });
});
