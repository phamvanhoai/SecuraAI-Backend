import { prisma } from '../../database/prisma.js';
import type { DepartmentReportQuery } from './dto/department-report.dto.js';

type Counts = {
  employees: number;
  assignedEmployees: number;
  assigned: number;
  completed: number;
  overdue: number;
  coverageRate: number;
  completionRate: number;
};
type Department = Counts & { id: string; name: string; code: string };
type Report = { items: Department[]; summary: Counts; total: number };

export const departmentReportRepository = {
  async get(this: void, query: DepartmentReportQuery, today: string): Promise<Report> {
    const rows = await prisma.$queryRaw<Report[]>`
      WITH active_users AS (
        SELECT u.user_id, u.department_id
        FROM users u
        WHERE u.status = 'active'
          AND u.disabled_at IS NULL
          AND u.deleted_at IS NULL
      ), enrollments AS (
        SELECT e.user_id, u.department_id, e.status, c.due_date
        FROM training_enrollments e
        JOIN active_users u ON u.user_id = e.user_id
        JOIN training_campaigns c ON c.training_campaign_id = e.training_campaign_id
        WHERE e.status <> 'withdrawn'
      ), departments_with_unassigned AS (
        SELECT department_id::text AS id, name, code FROM departments
        UNION ALL SELECT 'unassigned', 'No department', '—'
        WHERE EXISTS (SELECT 1 FROM active_users WHERE department_id IS NULL)
      ), grouped AS (
        SELECT d.id, d.name, d.code,
          COUNT(DISTINCT u.user_id)::int AS employees,
          COUNT(DISTINCT e.user_id)::int AS "assignedEmployees",
          COUNT(e.user_id)::int AS assigned,
          COUNT(e.user_id) FILTER (WHERE e.status = 'completed')::int AS completed,
          COUNT(e.user_id) FILTER (WHERE e.status <> 'completed' AND e.due_date < ${today}::date)::int AS overdue
        FROM departments_with_unassigned d
        LEFT JOIN active_users u ON COALESCE(u.department_id::text, 'unassigned') = d.id
        LEFT JOIN enrollments e ON e.user_id = u.user_id
        GROUP BY d.id, d.name, d.code
      ), metrics AS (
        SELECT *,
          CASE WHEN employees = 0 THEN 0 ELSE ROUND("assignedEmployees" * 100.0 / employees, 1) END AS "coverageRate",
          CASE WHEN assigned = 0 THEN 0 ELSE ROUND(completed * 100.0 / assigned, 1) END AS "completionRate"
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
          'employees', COUNT(DISTINCT u.user_id)::int,
          'assignedEmployees', COUNT(DISTINCT e.user_id)::int,
          'assigned', COUNT(e.user_id)::int,
          'completed', COUNT(e.user_id) FILTER (WHERE e.status = 'completed')::int,
          'overdue', COUNT(e.user_id) FILTER (WHERE e.status <> 'completed' AND e.due_date < ${today}::date)::int,
          'coverageRate', CASE WHEN COUNT(DISTINCT u.user_id) = 0 THEN 0 ELSE ROUND(COUNT(DISTINCT e.user_id) * 100.0 / COUNT(DISTINCT u.user_id), 1) END,
          'completionRate', CASE WHEN COUNT(e.user_id) = 0 THEN 0 ELSE ROUND(COUNT(e.user_id) FILTER (WHERE e.status = 'completed') * 100.0 / COUNT(e.user_id), 1) END
        ) FROM active_users u LEFT JOIN enrollments e ON e.user_id = u.user_id) AS summary
    `;
    const result = rows[0];
    if (!result) throw new Error('Department report query returned no result');
    return result;
  },
};
