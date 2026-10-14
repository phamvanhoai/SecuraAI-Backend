import { z } from 'zod';

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    departmentId: z.uuid().optional(),
    roleCode: z.enum(['ADMIN', 'SECURITY_OFFICER', 'EMPLOYEE', 'EXECUTIVE']).optional(),
    status: z
      .enum(['active', 'inactive', 'locked'])
      .transform((value) => value.toUpperCase() as 'ACTIVE' | 'INACTIVE' | 'LOCKED')
      .optional(),
  })
  .strict();

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
