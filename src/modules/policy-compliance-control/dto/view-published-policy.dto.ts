import { z } from 'zod';

export const publishedPolicyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['all', 'pending', 'acknowledged']).default('all'),
});

export const publishedPolicyParamsSchema = z.object({
  policyId: z.string().uuid(),
  versionId: z.string().uuid(),
});

export type PublishedPolicyListQuery = z.infer<typeof publishedPolicyListQuerySchema>;
