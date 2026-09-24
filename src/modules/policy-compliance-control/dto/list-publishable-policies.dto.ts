import { z } from 'zod';

export const listPublishablePoliciesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(['policyCode', 'title', 'updatedAt']).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListPublishablePoliciesQuery = z.infer<typeof listPublishablePoliciesQuerySchema>;
