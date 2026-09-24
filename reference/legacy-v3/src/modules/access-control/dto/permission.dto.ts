import { z } from 'zod';

export const listPermissionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    search: z.string().trim().min(1).max(100).optional(),
    module: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(['code', 'module', 'action']).default('code'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export type ListPermissionsQuery = z.infer<typeof listPermissionsQuerySchema>;
