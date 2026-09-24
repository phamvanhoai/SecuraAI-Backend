import { beforeEach, describe, expect, it, vi } from 'vitest';
import { departmentReportRepository } from './department-report.repository.js';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../database/prisma.js', () => ({ prisma: { $queryRaw: mocks.query } }));

describe('department report repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('separates workforce headcount from employees assigned to training', async () => {
    const report = {
      items: [],
      total: 0,
      summary: {
        employees: 0,
        assignedEmployees: 0,
        assigned: 0,
        completed: 0,
        overdue: 0,
        coverageRate: 0,
        completionRate: 0,
      },
    };
    mocks.query.mockResolvedValue([report]);

    await expect(
      departmentReportRepository.get({ page: 1, limit: 10, q: '', progress: 'all' }, '2026-09-19'),
    ).resolves.toEqual(report);

    const query = (mocks.query.mock.calls[0]?.[0] as TemplateStringsArray).join('?');
    expect(query).toContain('active_users');
    expect(query).toContain("u.status = 'active'");
    expect(query).toContain('u.disabled_at IS NULL');
    expect(query).toContain('u.deleted_at IS NULL');
    expect(query).toContain('"assignedEmployees"');
    expect(query).toContain('"coverageRate"');
    expect(query).toContain('LEFT JOIN active_users');
  });
});
