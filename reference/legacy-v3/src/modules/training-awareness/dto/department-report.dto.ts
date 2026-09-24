import { z } from 'zod';

export const departmentReportQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(100).default(''),
  progress: z.enum(['all', 'overdue', 'completed', 'no_assignments']).default('all'),
});
export type DepartmentReportQuery = z.infer<typeof departmentReportQuerySchema>;
