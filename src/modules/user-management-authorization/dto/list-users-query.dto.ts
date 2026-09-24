import { z } from 'zod';

export const userStatuses = ['active', 'inactive', 'locked', 'disabled'] as const;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  departmentId: z.uuid().optional(),
  roleCode: z.string().trim().min(1).max(50).optional(),
  status: z.enum(userStatuses).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;