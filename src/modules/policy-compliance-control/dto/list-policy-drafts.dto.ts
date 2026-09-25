import { z } from 'zod';

export const listPolicyDraftsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListPolicyDraftsQuery = z.infer<typeof listPolicyDraftsQuerySchema>;
