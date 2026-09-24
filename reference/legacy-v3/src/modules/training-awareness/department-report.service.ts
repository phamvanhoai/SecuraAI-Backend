import { AppError } from '../../common/errors/app-error.js';
import { departmentReportRepository } from './department-report.repository.js';
import type { DepartmentReportQuery } from './dto/department-report.dto.js';

export const departmentReportService = {
  async get(query: DepartmentReportQuery, actor: { permissions: readonly string[] }) {
    if (!actor.permissions.includes('training-department-reports.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await departmentReportRepository.get(
      query,
      new Date().toISOString().slice(0, 10),
    );
    return {
      items: result.items,
      summary: result.summary,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / query.limit)),
      },
    };
  },
};
