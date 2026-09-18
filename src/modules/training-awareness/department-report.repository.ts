import { prisma } from '../../database/prisma.js';
import type { DepartmentReportQuery } from './dto/department-report.dto.js';

type Counts = {
  employees: number;
  assigned: number;
  completed: number;
  overdue: number;
  completionRate: number;
};
type Department = Counts & { id: string; name: string; code: string };
type Report = { items: Department[]; summary: Counts; total: number };

export const departmentReportRepository = {
  async get(this: void, query: DepartmentReportQuery, today: string): Promise<Report> {
    const rows = await prisma.$queryRaw<Report[]>`
      WITH enrollments AS (
        SELECT e.user_id, u.department_id, e.status, c.due_date
        FROM training_enrollments e JOIN users u ON u.user_id = e.user_id
        JOIN training_campaigns c ON c.training_campaign_id = e.training_campaign_id
        WHERE e.status <> 'withdrawn'
      ), departments_with_unassigned AS (
        SELECT department_id::text AS id, name, code FROM departments
        UNION ALL SELECT 'unassigned', 'No department', '—'
        WHERE EXISTS (SELECT 1 FROM enrollments WHERE department_id IS NULL)
      ), grouped AS (
        SELECT d.id, d.name, d.code,
          COUNT(DISTINCT e.user_id)::int AS employees,
          COUNT(e.user_id)::int AS assigned,
          COUNT(e.user_id) FILTER (WHERE e.status = 'completed')::int AS completed,
          COUNT(e.user_id) FILTER (WHERE e.status <> 'completed' AND e.due_date < ${today}::date)::int AS overdue
        FROM departments_with_unassigned d LEFT JOIN enrollments e
          ON COALESCE(e.department_id::text, 'unassigned') = d.id
        GROUP BY d.id, d.name, d.code
      ), metrics AS (
        SELECT *, CASE WHEN assigned = 0 THEN 0 ELSE ROUND(completed * 100.0 / assigned, 1) END AS "completionRate"
        FROM grouped
      ), matching AS (
        SELECT * FROM metrics
        WHERE (strpos(lower(name), lower(${query.q})) > 0 OR strpos(lower(code), lower(${query.q})) > 0)
          AND (
            ${query.progress} = 'all'
            OR (${query.progress} = 'overdue' AND overdue > 0)
            OR (${query.progress} = 'completed' AND assigned > 0 AND completed = assigned)
            OR (${query.progress} = 'no_assignments' AND assigned = 0)
          )
      ), paged AS (
        SELECT * FROM matching ORDER BY lower(name), id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
      )
      SELECT COALESCE((SELECT json_agg(paged ORDER BY lower(name), id) FROM paged), '[]'::json) AS items,
        (SELECT COUNT(*)::int FROM matching) AS total,
        (SELECT json_build_object(
          'employees', COUNT(DISTINCT user_id)::int,
          'assigned', COUNT(*)::int,
          'completed', COUNT(*) FILTER (WHERE status = 'completed')::int,
          'overdue', COUNT(*) FILTER (WHERE status <> 'completed' AND due_date < ${today}::date)::int,
          'completionRate', CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*), 1) END
        ) FROM enrollments) AS summary
    `;
    const result = rows[0];
    if (!result) throw new Error('Department report query returned no result');
    return result;
  },
};
